import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRateBandDto } from './dto/create-rate-band.dto';
import { CreateShippingMethodDto } from './dto/create-shipping-method.dto';
import { UpdateShippingMethodDto } from './dto/update-shipping-method.dto';

@Injectable()
export class ShippingMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.shippingMethod.findMany({
      include: { rateBands: { orderBy: { minWeightKg: 'asc' } } },
      orderBy: { title: 'asc' },
    });
  }

  private async find(id: number) {
    const method = await this.prisma.shippingMethod.findUnique({
      where: { id },
      include: { rateBands: { orderBy: { minWeightKg: 'asc' } } },
    });
    if (!method) throw new NotFoundException('Shipping method not found');
    return method;
  }

  private validateDays(dto: CreateShippingMethodDto | UpdateShippingMethodDto) {
    if (
      dto.estimatedDaysMin !== undefined &&
      dto.estimatedDaysMax !== undefined &&
      dto.estimatedDaysMin > dto.estimatedDaysMax
    ) {
      throw new BadRequestException('estimatedDaysMin cannot exceed estimatedDaysMax');
    }
  }

  create(dto: CreateShippingMethodDto) {
    this.validateDays(dto);
    if ((dto.rateType ?? 'FLAT') === 'FLAT' && dto.flatRate === undefined) {
      throw new BadRequestException('flatRate is required for a flat-rate shipping method');
    }
    return this.prisma.shippingMethod.create({ data: dto, include: { rateBands: true } });
  }

  async update(id: number, dto: UpdateShippingMethodDto) {
    const current = await this.find(id);
    this.validateDays({
      estimatedDaysMin: dto.estimatedDaysMin ?? current.estimatedDaysMin ?? undefined,
      estimatedDaysMax: dto.estimatedDaysMax ?? current.estimatedDaysMax ?? undefined,
    });
    const rateType = dto.rateType ?? current.rateType;
    const flatRate = dto.flatRate ?? (current.flatRate ? Number(current.flatRate) : undefined);
    if (rateType === 'FLAT' && flatRate === undefined) {
      throw new BadRequestException('flatRate is required for a flat-rate shipping method');
    }
    return this.prisma.shippingMethod.update({
      where: { id }, data: dto, include: { rateBands: { orderBy: { minWeightKg: 'asc' } } },
    });
  }

  async remove(id: number) {
    await this.find(id);
    const orders = await this.prisma.order.count({ where: { shippingMethodId: id } });
    if (orders) throw new ConflictException('Shipping method is referenced by existing orders');
    await this.prisma.shippingMethod.delete({ where: { id } });
  }

  async addRateBand(id: number, dto: CreateRateBandDto) {
    await this.find(id);
    if (dto.minWeightKg >= dto.maxWeightKg) {
      throw new BadRequestException('minWeightKg must be less than maxWeightKg');
    }
    const overlap = await this.prisma.shippingRateBand.findFirst({
      where: {
        shippingMethodId: id,
        minWeightKg: { lt: dto.maxWeightKg },
        maxWeightKg: { gt: dto.minWeightKg },
      },
    });
    if (overlap) throw new ConflictException('Shipping rate band overlaps an existing band');
    return this.prisma.shippingRateBand.create({ data: { ...dto, shippingMethodId: id } });
  }

  async removeRateBand(id: number, bandId: number) {
    await this.find(id);
    const result = await this.prisma.shippingRateBand.deleteMany({
      where: { id: bandId, shippingMethodId: id },
    });
    if (!result.count) throw new NotFoundException('Shipping rate band not found');
  }
}
