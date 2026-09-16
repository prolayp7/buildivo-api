import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListQuoteRequestsQueryDto } from './dto/list-quote-requests-query.dto';
import { RespondQuoteRequestDto } from './dto/respond-quote-request.dto';

const quoteInclude = {
  items: { include: { productVariant: { include: { product: { select: { id: true, title: true, slug: true } } } } } },
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
};

@Injectable()
export class AdminQuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQuoteRequestsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where: Prisma.QuoteRequestWhereInput = { ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.quoteRequest.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' }, include: quoteInclude }),
      this.prisma.quoteRequest.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async find(id: number) {
    const item = await this.prisma.quoteRequest.findUnique({ where: { id }, include: quoteInclude });
    if (!item) throw new NotFoundException('Quote request not found');
    return item;
  }

  async respond(id: number, dto: RespondQuoteRequestDto) {
    await this.find(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        for (const item of dto.items) {
          const existing = await tx.quoteRequestItem.findUnique({ where: { id: item.id } });
          if (!existing || existing.quoteRequestId !== id) {
            throw new BadRequestException(`Item ${item.id} does not belong to this quote request`);
          }
          await tx.quoteRequestItem.update({ where: { id: item.id }, data: { quotedUnitPrice: item.quotedUnitPrice } });
        }
      }
      return tx.quoteRequest.update({
        where: { id },
        data: {
          status: dto.status,
          quotedTotal: dto.quotedTotal,
          adminNote: dto.adminNote,
          respondedAt: dto.status && dto.status !== 'NEW' ? new Date() : undefined,
        },
        include: quoteInclude,
      });
    });
  }
}
