import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { dateRange } from '../../../common/date-range';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';

@Injectable()
export class AdminNewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListSubscribersQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const q = query.q?.trim();
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(q ? { email: { contains: q, mode: 'insensitive' } } : {}),
      ...dateRange(query.dateFrom, query.dateTo),
    };
    const orderBy: Prisma.NewsletterSubscriberOrderByWithRelationInput = query.sort === 'oldest' ? { createdAt: 'asc' } : query.sort === 'email' ? { email: 'asc' } : { createdAt: 'desc' };
    const [items, total, all, last30Days] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({ where, ...paginationSkipTake(page, perPage), orderBy }),
      this.prisma.newsletterSubscriber.count({ where }),
      // Headline figures are store-wide, independent of the filters.
      this.prisma.newsletterSubscriber.count(),
      this.prisma.newsletterSubscriber.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary: { total: all, last30Days } } };
  }
}
