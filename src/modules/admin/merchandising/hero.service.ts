import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'; import { PrismaService } from '../../../prisma/prisma.service'; import { CreateHeroSlideDto } from './dto/create-hero-slide.dto'; import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto'; import { CreateTrustBadgeDto } from './dto/create-trust-badge.dto'; import { UpdateTrustBadgeDto } from './dto/update-trust-badge.dto';
@Injectable()
export class HeroService {
  constructor(private readonly prisma: PrismaService) {}
  async slides() {
    const slides = await this.prisma.heroSlide.findMany({
      include: {
        product: { select: { id: true, title: true, slug: true, variants: { where: { deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }], take: 1, select: { price: true, salePrice: true } } } },
        category: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    const productIds = slides.map((slide) => slide.product?.id).filter((id): id is number => id !== undefined);
    const media = productIds.length
      ? await this.prisma.media.findMany({ where: { ownerType: 'PRODUCT', ownerId: { in: productIds }, metadata: { path: ['mimeType'], string_starts_with: 'image/' } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
      : [];
    const firstMediaByProduct = new Map<number, (typeof media)[number]>();
    for (const item of media) if (!firstMediaByProduct.has(item.ownerId)) firstMediaByProduct.set(item.ownerId, item);
    return slides.map((slide) => ({
      ...slide,
      product: slide.product
        ? { id: slide.product.id, title: slide.product.title, slug: slide.product.slug, image: firstMediaByProduct.get(slide.product.id)?.url ?? null, price: slide.product.variants[0] ? Number(slide.product.variants[0].salePrice ?? slide.product.variants[0].price) : null }
        : null,
    }));
  }
  private validate(startsAt?: string | Date | null, endsAt?: string | Date | null) { if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) throw new BadRequestException('startsAt must be before endsAt'); }
  createSlide(dto: CreateHeroSlideDto) { this.validate(dto.startsAt, dto.endsAt); return this.prisma.heroSlide.create({ data: { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } }); }
  async updateSlide(id: number, dto: UpdateHeroSlideDto) { const current = await this.prisma.heroSlide.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Hero slide not found'); this.validate(dto.startsAt ?? current.startsAt, dto.endsAt ?? current.endsAt); return this.prisma.heroSlide.update({ where: { id }, data: { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } }); }
  async removeSlide(id: number) { const result = await this.prisma.heroSlide.deleteMany({ where: { id } }); if (!result.count) throw new NotFoundException('Hero slide not found'); }
  badges() { return this.prisma.heroTrustBadge.findMany({ orderBy: { sortOrder: 'asc' } }); }
  createBadge(dto: CreateTrustBadgeDto) { return this.prisma.heroTrustBadge.create({ data: dto }); }
  async updateBadge(id: number, dto: UpdateTrustBadgeDto) { const current = await this.prisma.heroTrustBadge.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Trust badge not found'); return this.prisma.heroTrustBadge.update({ where: { id }, data: dto }); }
  async removeBadge(id: number) { const result = await this.prisma.heroTrustBadge.deleteMany({ where: { id } }); if (!result.count) throw new NotFoundException('Trust badge not found'); }
}
