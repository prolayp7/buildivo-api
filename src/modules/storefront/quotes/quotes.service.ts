import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EmailService } from '../../email/email.service';
import { notificationEmail } from '../../email/email-templates';
import { resolveAdminEmail } from '../../email/admin-email.util';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';

const quoteItemInclude = { items: { include: { productVariant: { include: { product: { select: { title: true, slug: true } } } } } } };

@Injectable()
export class StorefrontQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(customerId: number | undefined, dto: CreateQuoteRequestDto) {
    const ids = [...new Set(dto.items.map((i) => i.productVariantId))];
    const count = await this.prisma.productVariant.count({ where: { id: { in: ids }, deletedAt: null } });
    if (count !== ids.length) throw new BadRequestException('One or more products are invalid');

    const created = await this.prisma.quoteRequest.create({
      data: {
        userId: customerId,
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
        items: { create: dto.items.map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity })) },
      },
      include: quoteItemInclude,
    });

    const to = await resolveAdminEmail(this.prisma);
    if (to) {
      const { subject, html } = notificationEmail({
        title: 'New quote request',
        message: `${dto.contactName} (${dto.email}) requested a quote for ${dto.items.length} item(s). Reference: ${created.uuid}.`,
      });
      void this.emailService.send(to, subject, html);
    }

    return created;
  }

  async listMine(customerId: number, query: PaginationQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where = { userId: customerId };
    const [items, total] = await Promise.all([
      this.prisma.quoteRequest.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' }, include: quoteItemInclude }),
      this.prisma.quoteRequest.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async detail(customerId: number, uuid: string) {
    const item = await this.prisma.quoteRequest.findFirst({ where: { uuid, userId: customerId }, include: quoteItemInclude });
    if (!item) throw new NotFoundException('Quote request not found');
    return item;
  }

  async accept(customerId: number, uuid: string) {
    const quote = await this.detail(customerId, uuid);
    if (quote.status !== 'QUOTED') throw new BadRequestException('Only a priced quote can be accepted');
    return this.prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' }, include: quoteItemInclude });
  }

  async decline(customerId: number, uuid: string) {
    const quote = await this.detail(customerId, uuid);
    if (quote.status !== 'QUOTED') throw new BadRequestException('Only a priced quote can be declined');
    return this.prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: 'DECLINED' }, include: quoteItemInclude });
  }
}
