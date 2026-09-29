import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RefundStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { dateRange } from '../../../common/date-range';
import { ListDisputesQueryDto } from './dto/list-disputes-query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { AuditService } from '../../../common/audit/audit.service';
import { PaypalGatewayService } from '../../payments/paypal-gateway.service';
import { StripeGatewayService } from '../../payments/stripe-gateway.service';
import { RefundSettlementService, refundOutcome } from '../../returns/refund-settlement.service';

// What a payments row needs to link to the order and its customer (never the full order).
const orderSummarySelect = { id: true, orderNumber: true, email: true, userId: true, user: { select: { id: true, firstName: true, lastName: true } } } as const;

// "Jane Smith" should find the customer by first + last name, not only by either one.
function customerNameMatch(q: string) {
  const [first, ...rest] = q.split(/\s+/);
  const last = rest.join(' ');
  return last
    ? [{ order: { user: { firstName: { contains: first, mode: 'insensitive' as const }, lastName: { contains: last, mode: 'insensitive' as const } } } }]
    : [{ order: { user: { OR: [{ firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }] } } }];
}

@Injectable()
export class PaymentOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stripeGateway: StripeGatewayService,
    private readonly paypalGateway: PaypalGatewayService,
    private readonly refundSettlement: RefundSettlementService,
  ) {}
  /** Sends the refund to the provider that took the payment. Throws if the provider rejects it. */
  private async refundAtProvider(transaction: { provider: string; providerTransactionId: string; currency: string }, refundId: number, amount: number) {
    const idempotencyKey = `refund-${refundId}`;
    if (transaction.provider === 'STRIPE') {
      return this.stripeGateway.refund(await this.stripeGateway.secretKey(), { paymentIntent: transaction.providerTransactionId, amount: amount.toFixed(2), idempotencyKey });
    }
    if (transaction.provider === 'PAYPAL') {
      const creds = await this.paypalGateway.credentials();
      return this.paypalGateway.refundCapture(creds, await this.paypalGateway.accessToken(creds), transaction.providerTransactionId, { amount: amount.toFixed(2), currency: transaction.currency, idempotencyKey });
    }
    return null; // not an online provider - recorded locally only
  }

  /** Refunds `amount` of an order's captured payment at the provider. The refund is only marked successful
   * once the provider confirms it: an immediate "succeeded" settles it now, "pending" leaves it PROCESSING
   * until the provider's webhook arrives, and a rejection records it FAILED (retryable). */
  async issueRefund(input: { orderId: number; amount: number; reason: string; adminId?: number; returnRequestId?: number; attempt?: number }) {
    const { orderId, amount, reason } = input;
    const actor = input.adminId ? { type: 'ADMIN' as const, id: input.adminId } : { type: 'SYSTEM' as const };
    if (!(amount > 0)) throw new BadRequestException('Refund amount must be greater than zero');

    // 1. reserve the amount so concurrent requests can't over-refund
    const { transaction, refund } = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.findFirst({ where: { orderId, status: 'CAPTURED' }, orderBy: { createdAt: 'desc' } });
      if (!transaction) throw new ConflictException('No captured payment transaction is available');
      const aggregate = await tx.paymentRefund.aggregate({ where: { transactionId: transaction.id, status: { in: ['PENDING', 'PROCESSING', 'PROCESSED'] } }, _sum: { amount: true } });
      if (Number(aggregate._sum.amount ?? 0) + amount > Number(transaction.amount) + 0.001) throw new BadRequestException('Refund exceeds the remaining captured amount');
      const refund = await tx.paymentRefund.create({ data: { transactionId: transaction.id, orderId, amount, reason, returnRequestId: input.returnRequestId, attempt: input.attempt ?? 1 } });
      return { transaction, refund };
    });
    await this.audit.log({ action: 'refund.requested', entity: 'PaymentRefund', entityId: refund.id, actor: input.adminId ? { type: 'ADMIN', id: input.adminId } : undefined, meta: { orderId, amount, reason, provider: transaction.provider, returnRequestId: input.returnRequestId ?? null } });

    // 2. money moves at the provider, outside any DB transaction
    let providerRefund: { id: string; status: string } | null;
    try {
      providerRefund = await this.refundAtProvider(transaction, refund.id, amount);
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      await this.refundSettlement.settle(refund.id, 'FAILED', { failureReason, actor });
      await this.audit.log({ action: 'refund.failed', entity: 'PaymentRefund', entityId: refund.id, actor: input.adminId ? { type: 'ADMIN', id: input.adminId } : undefined, meta: { error: failureReason } });
      return this.prisma.paymentRefund.findUniqueOrThrow({ where: { id: refund.id } });
    }

    // 3. record what the provider said; only a confirmed refund counts as successful
    await this.prisma.paymentRefund.update({ where: { id: refund.id }, data: { providerRefundId: providerRefund?.id, rawPayload: providerRefund ?? undefined, status: 'PROCESSING' } });
    // Offline providers have no confirmation step: the refund is recorded as done locally.
    const outcome = providerRefund ? refundOutcome(providerRefund.status) : 'PROCESSED';
    if (outcome !== 'PROCESSING') await this.refundSettlement.settle(refund.id, outcome, { providerRefundId: providerRefund?.id, failureReason: outcome === 'FAILED' ? `Provider status: ${providerRefund?.status}` : null, actor });
    await this.audit.log({ action: outcome === 'PROCESSED' ? 'refund.processed' : outcome === 'FAILED' ? 'refund.failed' : 'refund.processing', entity: 'PaymentRefund', entityId: refund.id, actor: input.adminId ? { type: 'ADMIN', id: input.adminId } : undefined, meta: { providerRefundId: providerRefund?.id ?? null, providerStatus: providerRefund?.status ?? null } });
    return this.prisma.paymentRefund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  /** Refunds part or all of an order's payment straight from the order screen (goodwill, cancellations). */
  async refundOrder(orderId: number, dto: RefundOrderDto, adminId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw new NotFoundException('Order not found');
    const refund = await this.issueRefund({ orderId, amount: dto.amount, reason: dto.reason?.trim() || 'Refund issued by admin', adminId });
    if (refund.status === 'FAILED') throw new BadGatewayException(refund.failureReason ?? 'The payment provider declined the refund');
    return { refund };
  }

  async listRefunds(query: { status?: RefundStatus; q?: string; page: number; perPage: number }) {
    const q = query.q?.trim();
    const where: Prisma.PaymentRefundWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [
        { providerRefundId: { contains: q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { order: { email: { contains: q, mode: 'insensitive' } } },
        { returnRequest: { returnNumber: { contains: q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total, grouped] = await Promise.all([
      this.prisma.paymentRefund.findMany({ where, ...paginationSkipTake(query.page, query.perPage), orderBy: { createdAt: 'desc' }, include: { order: { select: orderSummarySelect }, returnRequest: { select: { id: true, returnNumber: true, status: true } }, transaction: { select: { provider: true, providerTransactionId: true } } } }),
      this.prisma.paymentRefund.count({ where }),
      this.prisma.paymentRefund.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
    ]);
    const summary = Object.fromEntries(grouped.map((row) => [row.status, { count: row._count._all, amount: Number(row._sum.amount ?? 0) }]));
    return { items, meta: { ...buildPaginationMeta(query.page, query.perPage, total), summary } };
  }

  async listTransactions(query: ListTransactionsQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const q = query.q?.trim();
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...dateRange(query.dateFrom, query.dateTo),
      ...(q ? { OR: [
        { providerTransactionId: { contains: q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { order: { email: { contains: q, mode: 'insensitive' } } },
        ...customerNameMatch(q),
      ] } : {}),
    };
    const [items, total, captured] = await Promise.all([
      this.prisma.paymentTransaction.findMany({ where, ...paginationSkipTake(page, perPage), include: { order: { select: orderSummarySelect }, refunds: true, disputes: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.paymentTransaction.count({ where }),
      // Totals across every page of the current filter, not just the rows on screen.
      this.prisma.paymentTransaction.aggregate({ where: { AND: [where, { status: 'CAPTURED' }] }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary: { capturedAmount: Number(captured._sum.amount ?? 0), capturedCount: captured._count._all } } };
  }
  async listDisputes(query: ListDisputesQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const q = query.q?.trim();
    const where: Prisma.PaymentDisputeWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...dateRange(query.dateFrom, query.dateTo),
      ...(q ? { OR: [
        { providerDisputeId: { contains: q, mode: 'insensitive' } },
        { reasonCode: { contains: q, mode: 'insensitive' } },
        { reasonDescription: { contains: q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { order: { email: { contains: q, mode: 'insensitive' } } },
        ...customerNameMatch(q),
      ] } : {}),
    };
    const [items, total, open] = await Promise.all([
      this.prisma.paymentDispute.findMany({ where, ...paginationSkipTake(page, perPage), include: { order: { select: orderSummarySelect }, transaction: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.paymentDispute.count({ where }),
      this.prisma.paymentDispute.count({ where: { status: { in: ['WARNING', 'NEEDS_RESPONSE', 'UNDER_REVIEW'] } } }),
    ]);
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary: { openCount: open } } };
  }
  async updateDispute(id: number, dto: UpdateDisputeDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('Provide at least one field');
    const exists = await this.prisma.paymentDispute.findUnique({ where: { id } }); if (!exists) throw new NotFoundException('Payment dispute not found');
    return this.prisma.paymentDispute.update({ where: { id }, data: dto, include: { order: true, transaction: true } });
  }
}
