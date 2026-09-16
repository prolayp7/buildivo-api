import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'; import { MediaOwnerType, Prisma } from '@prisma/client'; import { existsSync, promises as fs } from 'fs'; import { join } from 'path'; import { OutputInfo } from 'sharp'; import { PrismaService } from '../../../prisma/prisma.service'; import { mediaUploadDirectory } from '../../../bootstrap'; import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination'; import { ListMediaQueryDto, UpdateMediaDto, UploadMediaDto } from './dto/media.dto';
const sharp = require('sharp');
export interface UploadedMediaFile { filename: string; originalname: string; mimetype: string; size: number; path: string; }
const extensionByType: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'application/pdf': '.pdf', 'text/csv': '.csv', 'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'video/mp4': '.mp4', 'video/webm': '.webm' };
// SEO-friendly filenames: slugify the alt text (e.g. a hero slide's headline)
// and keep multer's random name alongside it so uploads never collide.
function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
@Injectable() export class MediaService {
  constructor(private readonly prisma: PrismaService) {}
  async assertOwner(type: MediaOwnerType, id: number) {
    if (type === 'LIBRARY') return;
    const exists = await this.ownerExists(type, id); if (!exists) throw new NotFoundException(`${type.toLowerCase()} owner not found`);
  }
  private ownerExists(type: MediaOwnerType, id: number): Promise<unknown> {
    switch (type) {
      case 'LIBRARY': return Promise.resolve(true);
      case 'PRODUCT': return this.prisma.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'PRODUCT_VARIANT': return this.prisma.productVariant.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'CATEGORY': return this.prisma.category.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'BRAND': return this.prisma.brand.findUnique({ where: { id }, select: { id: true } });
      case 'BLOG_POST': return this.prisma.blogPost.findUnique({ where: { id }, select: { id: true } });
      case 'BLOG_CATEGORY': return this.prisma.blogCategory.findUnique({ where: { id }, select: { id: true } });
      case 'AUTHOR': return this.prisma.author.findUnique({ where: { id }, select: { id: true } });
      case 'PAGE': return this.prisma.page.findUnique({ where: { id }, select: { id: true } });
      case 'BANNER': return this.prisma.banner.findUnique({ where: { id }, select: { id: true } });
      case 'TESTIMONIAL': return this.prisma.testimonial.findUnique({ where: { id }, select: { id: true } });
      case 'HERO_SLIDE': return this.prisma.heroSlide.findUnique({ where: { id }, select: { id: true } });
      case 'USER': return this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'REVIEW': return this.prisma.review.findUnique({ where: { id }, select: { id: true } });
      case 'ORDER_ITEM_RETURN': return this.prisma.orderItemReturn.findUnique({ where: { id }, select: { id: true } });
    }
  }
  async list(query: ListMediaQueryDto) {
    if ((query.ownerType === undefined) !== (query.ownerId === undefined)) throw new BadRequestException('ownerType and ownerId must be provided together');
    if (query.ownerType !== undefined && query.ownerId !== undefined) await this.assertOwner(query.ownerType, query.ownerId);
    const page = query.page!; const perPage = query.perPage!; const search = query.search?.trim();
    const where: Prisma.MediaWhereInput = {
      ...(query.ownerType !== undefined ? { ownerType: query.ownerType, ownerId: query.ownerId } : {}),
      ...(query.collection ? { collection: query.collection } : {}),
      ...(search ? { OR: [{ altText: { contains: search, mode: 'insensitive' } }, { collection: { contains: search, mode: 'insensitive' } }, { metadata: { path: ['originalName'], string_contains: search } }] } : {}),
      ...(query.type === 'IMAGE' ? { metadata: { path: ['mimeType'], string_starts_with: 'image/' } } : {}),
      ...(query.type === 'DOCUMENT' ? { NOT: { metadata: { path: ['mimeType'], string_starts_with: 'image/' } } } : {}),
    };
    const [items, total, collections, ownerTypes] = await Promise.all([
      this.prisma.media.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.media.count({ where }),
      this.prisma.media.findMany({ distinct: ['collection'], select: { collection: true }, orderBy: { collection: 'asc' } }),
      this.prisma.media.findMany({ distinct: ['ownerType'], select: { ownerType: true }, orderBy: { ownerType: 'asc' } }),
    ]);
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), collections: collections.map((item) => item.collection), ownerTypes: ownerTypes.map((item) => item.ownerType) } };
  }
  async create(dto: UploadMediaDto, file?: UploadedMediaFile) {
    if (!file) throw new BadRequestException('Image file is required');
    let target: string | undefined;
    try {
      if ((dto.ownerType === 'PRODUCT' && dto.collection === 'products') || (dto.ownerType === 'LIBRARY' && dto.collection.startsWith('branding-'))) {
        const allowedProductImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const allowedProductVideoTypes = new Set(['video/mp4', 'video/webm']);
        if (allowedProductVideoTypes.has(file.mimetype)) {
          if (file.size > 25 * 1024 * 1024) throw new BadRequestException('Videos must be 25 MB or smaller');
        } else if (!allowedProductImageTypes.has(file.mimetype)) {
          throw new BadRequestException('Images must be JPG, PNG or WebP files (or MP4/WebM video)');
        } else if (file.size > 2 * 1024 * 1024) {
          throw new BadRequestException('Images must be 2 MB or smaller');
        }
      }
      const extension = extensionByType[file.mimetype]; if (!extension) throw new BadRequestException('Unsupported file type');
      await this.assertOwner(dto.ownerType, dto.ownerId);
      const isImage = file.mimetype.startsWith('image/');
      const seoSlug = dto.altText ? slugify(dto.altText) : '';
      const filename = `${seoSlug ? `${seoSlug}-` : ''}${file.filename}${isImage ? '.webp' : extension}`;
      target = join(mediaUploadDirectory, filename);
      let metadata: Prisma.InputJsonObject;
      if (isImage) {
        let result: OutputInfo;
        try {
          result = await sharp(file.path, { animated: true })
            .rotate()
            .webp({ quality: 82, alphaQuality: 90, effort: 4, smartSubsample: true })
            .toFile(target);
        } catch (conversionError) {
          const reason = conversionError instanceof Error ? conversionError.message : 'invalid image data';
          throw new BadRequestException(`Image could not be converted to WebP: ${reason}`);
        }
        await fs.unlink(file.path).catch(() => undefined);
        metadata = {
          originalName: file.originalname,
          originalMimeType: file.mimetype,
          originalSize: file.size,
          mimeType: 'image/webp',
          size: result.size,
          width: result.width,
          height: result.height,
          pages: result.pages ?? 1,
        };
      } else {
        await fs.rename(file.path, target);
        metadata = { originalName: file.originalname, mimeType: file.mimetype, size: file.size };
      }
      return await this.prisma.media.create({ data: { ...dto, url: `/uploads/${filename}`, metadata } });
    } catch (error) {
      if (file.path && existsSync(file.path)) await fs.unlink(file.path).catch(() => undefined);
      if (target && existsSync(target)) await fs.unlink(target).catch(() => undefined);
      throw error;
    }
  }
  async update(id: number, dto: UpdateMediaDto) { const media = await this.prisma.media.findUnique({ where: { id } }); if (!media) throw new NotFoundException('Media not found'); return this.prisma.media.update({ where: { id }, data: dto }); }
  async remove(id: number) { const media = await this.prisma.media.findUnique({ where: { id } }); if (!media) throw new NotFoundException('Media not found'); await this.prisma.media.delete({ where: { id } }); if (media.url.startsWith('/uploads/')) { const filename = media.url.slice('/uploads/'.length); if (filename && filename === filename.split('/').pop()) await fs.unlink(join(mediaUploadDirectory, filename)).catch(() => undefined); } }
}
