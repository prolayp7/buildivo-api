import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { ListBrandsQueryDto } from '../brands/dto/list-brands-query.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: ListBrandsQueryDto) {
    const page = query.page!; const perPage = query.perPage!; const q = query.q?.trim();
    const where: Prisma.SupplierWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total, all, enabled, productsAssigned] = await Promise.all([
      this.prisma.supplier.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { title: 'asc' }, include: { _count: { select: { products: true } } } }),
      this.prisma.supplier.count({ where }),
      // Headline figures are store-wide, independent of the search.
      this.prisma.supplier.count(),
      this.prisma.supplier.count({ where: { status: 'ACTIVE' } }),
      this.prisma.product.count({ where: { supplierId: { not: null } } }),
    ]);
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary: { total: all, enabled, productsAssigned } } };
  }
  async detail(id: number) { const item = await this.prisma.supplier.findUnique({ where: { id } }); if (!item) throw new NotFoundException('Supplier not found'); return item; }
  async create(dto: CreateSupplierDto) { try { return await this.prisma.supplier.create({ data: dto }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Supplier slug "${dto.slug}" is already in use`); throw error; } }
  async update(id: number, dto: UpdateSupplierDto) { await this.detail(id); return this.prisma.supplier.update({ where: { id }, data: dto }); }
  async remove(id: number) { await this.detail(id); await this.prisma.supplier.delete({ where: { id } }); }
}
