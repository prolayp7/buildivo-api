import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { BundleItemDto, CreateBundleDto } from './dto/create-bundle.dto';
import { ListBundlesQueryDto } from './dto/list-bundles-query.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

const bundleInclude = {
  items: { include: { productVariant: { include: { product: { select: { id: true, title: true, slug: true } } } } } },
};

@Injectable()
export class BundlesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBundlesQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where: Prisma.ProductBundleWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.productBundle.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' }, include: bundleInclude }),
      this.prisma.productBundle.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async find(id: number) {
    const item = await this.prisma.productBundle.findFirst({ where: { id, deletedAt: null }, include: bundleInclude });
    if (!item) throw new NotFoundException('Bundle not found');
    return item;
  }

  private async assertSlug(slug: string, excludeId?: number) {
    const existing = await this.prisma.productBundle.findFirst({ where: { slug, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException(`Bundle slug "${slug}" is already in use`);
  }

  private async assertItems(items: BundleItemDto[]) {
    const ids = items.map((i) => i.productVariantId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate product variant in bundle items');
    const count = await this.prisma.productVariant.count({ where: { id: { in: ids }, deletedAt: null } });
    if (count !== ids.length) throw new BadRequestException('One or more bundle items reference an invalid product variant');
  }

  async create(dto: CreateBundleDto) {
    await this.assertSlug(dto.slug);
    await this.assertItems(dto.items);
    return this.prisma.productBundle.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        bundlePrice: dto.bundlePrice,
        status: dto.status,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        items: { create: dto.items.map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity ?? 1 })) },
      },
      include: bundleInclude,
    });
  }

  async update(id: number, dto: UpdateBundleDto) {
    await this.find(id);
    if (dto.slug) await this.assertSlug(dto.slug, id);
    if (dto.items) await this.assertItems(dto.items);
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.productBundleItem.deleteMany({ where: { bundleId: id } });
        await tx.productBundleItem.createMany({ data: dto.items.map((i) => ({ bundleId: id, productVariantId: i.productVariantId, quantity: i.quantity ?? 1 })) });
      }
      return tx.productBundle.update({
        where: { id },
        data: {
          title: dto.title,
          slug: dto.slug,
          description: dto.description,
          bundlePrice: dto.bundlePrice,
          status: dto.status,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
        include: bundleInclude,
      });
    });
  }

  async remove(id: number) {
    await this.find(id);
    await this.prisma.productBundle.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
