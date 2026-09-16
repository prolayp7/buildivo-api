import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

const include = { products: { include: { product: { include: { brand: true, category: true } } }, orderBy: { sortOrder: 'asc' as const } } };

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.collection.findMany({ include, orderBy: { title: 'asc' } }); }

  private async find(id: number) {
    const item = await this.prisma.collection.findUnique({ where: { id }, include });
    if (!item) throw new NotFoundException('Collection not found');
    return item;
  }

  private async productRows(tx: Prisma.TransactionClient, productIds: number[]) {
    const count = await tx.product.count({ where: { id: { in: productIds }, deletedAt: null } });
    if (count !== productIds.length) throw new BadRequestException('One or more products are invalid');
    return productIds.map((productId, sortOrder) => ({ productId, sortOrder }));
  }

  async create(dto: CreateCollectionDto) {
    const { productIds, ...data } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const products = await this.productRows(tx, productIds);
        return tx.collection.create({ data: { ...data, products: { create: products } }, include });
      });
    } catch (error) { return this.mapSlugError(error, dto.slug); }
  }

  async update(id: number, dto: UpdateCollectionDto) {
    await this.find(id);
    const { productIds, ...data } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const products = productIds !== undefined ? await this.productRows(tx, productIds) : undefined;
        return tx.collection.update({ where: { id }, data: {
          ...data,
          ...(products ? { products: { deleteMany: {}, create: products } } : {}),
        }, include });
      });
    } catch (error) { return this.mapSlugError(error, dto.slug ?? ''); }
  }

  async remove(id: number) { await this.find(id); await this.prisma.collection.delete({ where: { id } }); }

  private mapSlugError(error: unknown, slug: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Collection slug "${slug}" is already in use`);
    throw error;
  }
}
