import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateProductConditionDto } from './dto/create-product-condition.dto';

@Injectable()
export class ProductConditionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.productCondition.findMany({ orderBy: { title: 'asc' } });
  }

  async create(dto: CreateProductConditionDto) {
    try {
      return await this.prisma.productCondition.create({ data: dto });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Product condition slug "${dto.slug}" is already in use`);
      }
      throw error;
    }
  }
}
