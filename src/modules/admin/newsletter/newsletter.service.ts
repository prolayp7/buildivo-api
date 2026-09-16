import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';

@Injectable()
export class AdminNewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListSubscribersQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where: Prisma.NewsletterSubscriberWhereInput = query.q ? { email: { contains: query.q, mode: 'insensitive' } } : {};
    const [items, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' } }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
}
