import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ListCouponsQueryDto } from './dto/list-coupons-query.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CreateAutomaticDiscountDto } from './dto/create-automatic-discount.dto';
import { UpdateAutomaticDiscountDto } from './dto/update-automatic-discount.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: ListCouponsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where: Prisma.CouponWhereInput = { ...(query.includeDeleted ? {} : { deletedAt: null }), ...(query.q ? { code: { contains: query.q, mode: 'insensitive' } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' } }),
      this.prisma.coupon.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
  async find(id: number) {
    const item = await this.prisma.coupon.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new NotFoundException('Coupon not found');
    return item;
  }
  private validate(type: DiscountType, amount: number, startsAt?: string | Date | null, endsAt?: string | Date | null) {
    if (type === 'PERCENT' && amount > 100) throw new BadRequestException('Percentage discount cannot exceed 100');
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) throw new BadRequestException('startsAt must be before endsAt');
  }
  private async assertCode(code: string, excludeId?: number) {
    const existing = await this.prisma.coupon.findFirst({ where: { code: { equals: code, mode: 'insensitive' }, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException(`Coupon code "${code}" is already in use`);
  }
  async create(dto: CreateCouponDto) {
    const code = dto.code.trim().toUpperCase();
    await this.assertCode(code); this.validate(dto.discountType, dto.discountAmount, dto.startsAt, dto.endsAt);
    return this.prisma.coupon.create({ data: { ...dto, code, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } });
  }
  async update(id: number, dto: UpdateCouponDto) {
    const current = await this.find(id); const code = dto.code?.trim().toUpperCase();
    if (code) await this.assertCode(code, id);
    this.validate(dto.discountType ?? current.discountType, dto.discountAmount ?? Number(current.discountAmount), dto.startsAt ?? current.startsAt, dto.endsAt ?? current.endsAt);
    return this.prisma.coupon.update({ where: { id }, data: { ...dto, code, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } });
  }
  async remove(id: number) { await this.find(id); await this.prisma.coupon.update({ where: { id }, data: { deletedAt: new Date() } }); }
  listAutomatic() { return this.prisma.automaticDiscount.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }); }
  async automaticDetail(id: number) { const item = await this.prisma.automaticDiscount.findFirst({ where: { id, deletedAt: null } }); if (!item) throw new NotFoundException('Automatic discount not found'); return item; }
  createAutomatic(dto: CreateAutomaticDiscountDto) { this.validate(dto.discountType, dto.discountAmount, dto.startsAt, dto.endsAt); return this.prisma.automaticDiscount.create({ data: { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } }); }
  async updateAutomatic(id: number, dto: UpdateAutomaticDiscountDto) { const current = await this.automaticDetail(id); this.validate(dto.discountType ?? current.discountType, dto.discountAmount ?? Number(current.discountAmount), dto.startsAt ?? current.startsAt, dto.endsAt ?? current.endsAt); return this.prisma.automaticDiscount.update({ where: { id }, data: { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } }); }
  async removeAutomatic(id: number) { await this.automaticDetail(id); await this.prisma.automaticDiscount.update({ where: { id }, data: { deletedAt: new Date() } }); }
}
