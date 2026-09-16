import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';

@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.taxRate.findMany({ orderBy: { title: 'asc' } });
  }

  async create(dto: CreateTaxRateDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.taxRate.create({ data: dto });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Tax rate title "${dto.title}" is already in use`);
      }
      throw error;
    }
  }
}
