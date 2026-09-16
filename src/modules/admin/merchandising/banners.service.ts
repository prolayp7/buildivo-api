import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BannerLinkType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
const include = { product: true, category: true, brand: true };
@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.banner.findMany({ include, orderBy: [{ position: 'asc' }, { displayOrder: 'asc' }] }); }
  private async find(id: number) { const item = await this.prisma.banner.findUnique({ where: { id } }); if (!item) throw new NotFoundException('Banner not found'); return item; }
  private validate(linkType: BannerLinkType, values: { productId?: number | null; categoryId?: number | null; brandId?: number | null; customUrl?: string | null }, startsAt?: string | Date | null, endsAt?: string | Date | null) {
    const targets = { PRODUCT: values.productId, CATEGORY: values.categoryId, BRAND: values.brandId, CUSTOM_URL: values.customUrl };
    if (!targets[linkType]) throw new BadRequestException(`${linkType.toLowerCase()} target is required`);
    if (Object.entries(targets).some(([type, value]) => type !== linkType && value)) throw new BadRequestException('Only the selected link type target may be provided');
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) throw new BadRequestException('startsAt must be before endsAt');
  }
  private data(dto: CreateBannerDto | UpdateBannerDto) { return { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined }; }
  async create(dto: CreateBannerDto) { this.validate(dto.linkType, dto, dto.startsAt, dto.endsAt); try { return await this.prisma.banner.create({ data: this.data(dto) as Prisma.BannerUncheckedCreateInput, include }); } catch (e) { return this.map(e, dto.slug); } }
  async update(id: number, dto: UpdateBannerDto) {
    const current = await this.find(id);
    const linkType = dto.linkType ?? current.linkType;
    const values = dto.linkType
      ? { productId: dto.productId, categoryId: dto.categoryId, brandId: dto.brandId, customUrl: dto.customUrl }
      : { productId: dto.productId ?? current.productId, categoryId: dto.categoryId ?? current.categoryId, brandId: dto.brandId ?? current.brandId, customUrl: dto.customUrl ?? current.customUrl };
    this.validate(linkType, values, dto.startsAt ?? current.startsAt, dto.endsAt ?? current.endsAt);
    try { return await this.prisma.banner.update({ where: { id }, data: {
      ...this.data(dto),
      productId: linkType === 'PRODUCT' ? values.productId : null,
      categoryId: linkType === 'CATEGORY' ? values.categoryId : null,
      brandId: linkType === 'BRAND' ? values.brandId : null,
      customUrl: linkType === 'CUSTOM_URL' ? values.customUrl : null,
    }, include }); } catch (e) { return this.map(e, dto.slug ?? current.slug); }
  }
  async remove(id: number) { await this.find(id); await this.prisma.banner.delete({ where: { id } }); }
  private map(error: unknown, slug: string): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Banner slug "${slug}" is already in use`); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new BadRequestException('Banner target not found'); throw error; }
}
