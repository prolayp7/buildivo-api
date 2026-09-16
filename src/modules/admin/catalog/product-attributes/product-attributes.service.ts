import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateProductAttributeDto } from './dto/create-product-attribute.dto';
import { CreateProductAttributeValueDto } from './dto/create-product-attribute-value.dto';
import { UpdateProductAttributeDto } from './dto/update-product-attribute.dto';
import { UpdateProductAttributeValueDto } from './dto/update-product-attribute-value.dto';

@Injectable()
export class ProductAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.productAttribute.findMany({
      where: { deletedAt: null },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { title: 'asc' },
    });
  }

  async create(dto: CreateProductAttributeDto) {
    const existing = await this.prisma.productAttribute.findFirst({
      where: { slug: dto.slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Product attribute slug "${dto.slug}" is already in use`);
    }
    return this.prisma.productAttribute.create({ data: dto, include: { values: true } });
  }

  private async attribute(id: number) {
    const attribute = await this.prisma.productAttribute.findFirst({ where: { id, deletedAt: null } });
    if (!attribute) throw new NotFoundException('Product attribute not found');
    return attribute;
  }

  async update(id: number, dto: UpdateProductAttributeDto) {
    await this.attribute(id);
    if (dto.slug) {
      const duplicate = await this.prisma.productAttribute.findFirst({ where: { slug: dto.slug, deletedAt: null, id: { not: id } } });
      if (duplicate) throw new ConflictException(`Product attribute slug "${dto.slug}" is already in use`);
    }
    return this.prisma.productAttribute.update({ where: { id }, data: dto, include: { values: { orderBy: { sortOrder: 'asc' } } } });
  }

  async remove(id: number) {
    await this.attribute(id);
    const used = await this.prisma.productVariantAttribute.count({ where: { attributeId: id } });
    if (used) throw new ConflictException('This attribute is used by product combinations and cannot be deleted');
    await this.prisma.productAttribute.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async createValue(attributeId: number, dto: CreateProductAttributeValueDto) {
    const attribute = await this.prisma.productAttribute.findFirst({
      where: { id: attributeId, deletedAt: null },
      select: { id: true },
    });
    if (!attribute) throw new NotFoundException('Product attribute not found');

    try {
      return await this.prisma.productAttributeValue.create({
        data: { ...dto, attributeId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Attribute value "${dto.value}" already exists`);
      }
      throw error;
    }
  }


  async updateValue(attributeId: number, valueId: number, dto: UpdateProductAttributeValueDto) {
    await this.attribute(attributeId);
    const value = await this.prisma.productAttributeValue.findFirst({ where: { id: valueId, attributeId } });
    if (!value) throw new NotFoundException('Attribute value not found');
    try {
      return await this.prisma.productAttributeValue.update({ where: { id: valueId }, data: dto });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Attribute value "${dto.value}" already exists`);
      throw error;
    }
  }

  async removeValue(attributeId: number, valueId: number) {
    await this.attribute(attributeId);
    const value = await this.prisma.productAttributeValue.findFirst({ where: { id: valueId, attributeId } });
    if (!value) throw new NotFoundException('Attribute value not found');
    const used = await this.prisma.productVariantAttribute.count({ where: { attributeValueId: valueId } });
    if (used) throw new ConflictException('This value is used by product combinations and cannot be deleted');
    await this.prisma.productAttributeValue.delete({ where: { id: valueId } });
  }
}
