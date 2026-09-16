import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GiftCardStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { CreateGiftCardDto } from './dto/create-gift-card.dto';
import { ListGiftCardsQueryDto } from './dto/list-gift-cards-query.dto';
import { UpdateGiftCardDto } from './dto/update-gift-card.dto';

@Injectable()
export class GiftCardsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: ListGiftCardsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where: Prisma.GiftCardWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.q ? { code: { contains: query.q, mode: 'insensitive' } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.giftCard.findMany({ where, ...paginationSkipTake(page, perPage), include: { transactions: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.giftCard.count({ where }),
    ]); return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
  private code() { return `UKCS-${randomBytes(8).toString('hex').toUpperCase()}`; }
  async create(dto: CreateGiftCardDto) {
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date()) throw new BadRequestException('expiresAt must be in the future');
    const currency = (dto.currency ?? 'GBP').toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      const giftCard = await tx.giftCard.create({ data: { code: this.code(), initialBalance: dto.initialBalance, currentBalance: dto.initialBalance, currency, issuedToEmail: dto.issuedToEmail?.toLowerCase(), expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined } });
      const transaction = await tx.giftCardTransaction.create({ data: { giftCardId: giftCard.id, amount: dto.initialBalance, type: 'ISSUE' } });
      return { giftCard, transaction };
    });
  }
  async update(id: number, dto: UpdateGiftCardDto) {
    if (dto.status === undefined && dto.adjustment === undefined) throw new BadRequestException('Provide status or adjustment');
    if (dto.adjustment === 0) throw new BadRequestException('adjustment cannot be zero');
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.giftCard.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Gift card not found');
      const balance = Number(current.currentBalance) + (dto.adjustment ?? 0);
      if (balance < 0) throw new BadRequestException('Adjustment cannot make the balance negative');
      let status: GiftCardStatus = dto.status ?? current.status;
      if (dto.adjustment !== undefined && dto.status === undefined) {
        if (balance === 0) status = 'REDEEMED';
        else if (current.status === 'REDEEMED') status = 'ACTIVE';
      }
      const giftCard = await tx.giftCard.update({ where: { id }, data: { status, ...(dto.adjustment !== undefined ? { currentBalance: balance } : {}) } });
      const transaction = dto.adjustment !== undefined ? await tx.giftCardTransaction.create({ data: { giftCardId: id, amount: dto.adjustment, type: 'ADJUSTMENT' } }) : undefined;
      return { giftCard, ...(transaction ? { transaction } : {}) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
