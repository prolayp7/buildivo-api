import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBrandsQueryDto) {
    const page = query.page!; const perPage = query.perPage!; const q = query.q?.trim();
    const where: Prisma.BrandWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total, all, enabled, productsAssigned] = await Promise.all([
      this.prisma.brand.findMany({
        where, ...paginationSkipTake(page, perPage),
        orderBy: { title: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.brand.count({ where }),
      // Headline figures are store-wide, independent of the search.
      this.prisma.brand.count(),
      this.prisma.brand.count({ where: { status: 'ACTIVE' } }),
      this.prisma.product.count({ where: { brandId: { not: null } } }),
    ]);
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary: { total: all, enabled, productsAssigned } } };
  }

  async detail(id: number) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async create(dto: CreateBrandDto) {
    try {
      return await this.prisma.brand.create({ data: dto });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Brand slug "${dto.slug}" is already in use`);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateBrandDto) {
    await this.detail(id);
    try {
      return await this.prisma.brand.update({ where: { id }, data: dto });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Brand slug "${dto.slug}" is already in use`);
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    await this.detail(id);
    await this.prisma.brand.delete({ where: { id } });
  }
}
