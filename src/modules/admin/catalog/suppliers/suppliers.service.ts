import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.supplier.findMany({ orderBy: { title: 'asc' }, include: { _count: { select: { products: true } } } }); }
  async detail(id: number) { const item = await this.prisma.supplier.findUnique({ where: { id } }); if (!item) throw new NotFoundException('Supplier not found'); return item; }
  async create(dto: CreateSupplierDto) { try { return await this.prisma.supplier.create({ data: dto }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Supplier slug "${dto.slug}" is already in use`); throw error; } }
  async update(id: number, dto: UpdateSupplierDto) { await this.detail(id); return this.prisma.supplier.update({ where: { id }, data: dto }); }
  async remove(id: number) { await this.detail(id); await this.prisma.supplier.delete({ where: { id } }); }
}
