import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { dateRange } from '../../../common/date-range';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: ListReviewsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const q = query.q?.trim();
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.verified ? { orderItemId: query.verified === 'true' ? { not: null } : null } : {}),
      ...dateRange(query.dateFrom, query.dateTo),
      ...(q ? { OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { comment: { contains: q, mode: 'insensitive' } },
        { reviewerName: { contains: q, mode: 'insensitive' } },
        { product: { title: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total, pendingCount] = await Promise.all([
      this.prisma.review.findMany({ where, ...paginationSkipTake(page, perPage), include: { product: true, user: { select: { id: true, email: true, firstName: true, lastName: true } }, orderItem: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.review.count({ where }),
      // Store-wide, so the Pending tab badge stays right whichever tab is open.
      this.prisma.review.count({ where: { status: 'PENDING' } }),
    ]); return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary: { pendingCount } } };
  }
  private async find(id: number) { const item = await this.prisma.review.findUnique({ where: { id } }); if (!item) throw new NotFoundException('Review not found'); return item; }
  async approve(id: number) { await this.find(id); return this.prisma.review.update({ where: { id }, data: { status: 'APPROVED' }, include: { product: true, user: true } }); }
  async reject(id: number) { await this.find(id); return this.prisma.review.update({ where: { id }, data: { status: 'REJECTED' }, include: { product: true, user: true } }); }
  async remove(id: number) { await this.find(id); await this.prisma.review.delete({ where: { id } }); }
}
