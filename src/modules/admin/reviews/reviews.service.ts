import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: ListReviewsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where = { ...(query.status ? { status: query.status } : {}), ...(query.productId ? { productId: query.productId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({ where, ...paginationSkipTake(page, perPage), include: { product: true, user: { select: { id: true, email: true, firstName: true, lastName: true } }, orderItem: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.review.count({ where }),
    ]); return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
  private async find(id: number) { const item = await this.prisma.review.findUnique({ where: { id } }); if (!item) throw new NotFoundException('Review not found'); return item; }
  async approve(id: number) { await this.find(id); return this.prisma.review.update({ where: { id }, data: { status: 'APPROVED' }, include: { product: true, user: true } }); }
  async reject(id: number) { await this.find(id); return this.prisma.review.update({ where: { id }, data: { status: 'REJECTED' }, include: { product: true, user: true } }); }
  async remove(id: number) { await this.find(id); await this.prisma.review.delete({ where: { id } }); }
}
