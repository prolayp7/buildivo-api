import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ApproveReturnDto } from './dto/approve-return.dto';
import { ListDisputesQueryDto } from './dto/list-disputes-query.dto';
import { ListReturnsQueryDto } from './dto/list-returns-query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { RefundReturnDto } from './dto/refund-return.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { AuditService } from '../../../common/audit/audit.service';
import { PaypalGatewayService } from '../../payments/paypal-gateway.service';
import { StripeGatewayService } from '../../payments/stripe-gateway.service';
import { EmailService } from '../../email/email.service';
import { orderRefundedEmail } from '../../email/email-templates';

const returnInclude = { user: { select: { id: true, email: true, firstName: true, lastName: true } }, orderItem: { include: { order: true, product: true, productVariant: true } } };

@Injectable()
export class PaymentOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly stripeGateway: StripeGatewayService,
    private readonly paypalGateway: PaypalGatewayService,
  ) {}
  async listReturns(query: ListReturnsQueryDto) {
    const page = query.page!; const perPage = query.perPage!; const where = query.status ? { returnStatus: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.orderItemReturn.findMany({ where, ...paginationSkipTake(page, perPage), include: returnInclude, orderBy: { createdAt: 'desc' } }),
      this.prisma.orderItemReturn.count({ where }),
    ]); return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
  private async findReturn(id: number) {
    const item = await this.prisma.orderItemReturn.findUnique({ where: { id }, include: returnInclude });
    if (!item) throw new NotFoundException('Return request not found'); return item;
  }
  private requireStatus(actual: ReturnStatus, allowed: ReturnStatus[]) {
    if (!allowed.includes(actual)) throw new ConflictException(`Return cannot be changed from ${actual}`);
  }
  async approve(id: number, dto: ApproveReturnDto) {
    const item = await this.findReturn(id); this.requireStatus(item.returnStatus, ['REQUESTED']);
    return this.prisma.orderItemReturn.update({ where: { id }, data: { returnStatus: 'APPROVED', approvedAt: new Date(), pickupStatus: dto.pickupStatus ?? 'PENDING' }, include: returnInclude });
  }
  async reject(id: number, dto: RejectReturnDto) {
    const item = await this.findReturn(id); this.requireStatus(item.returnStatus, ['REQUESTED']);
    return this.prisma.orderItemReturn.update({ where: { id }, data: { returnStatus: 'REJECTED', comment: dto.comment ?? item.comment }, include: returnInclude });
  }
  async receive(id: number) {
    const item = await this.findReturn(id); this.requireStatus(item.returnStatus, ['APPROVED']);
    return this.prisma.orderItemReturn.update({ where: { id }, data: { returnStatus: 'RECEIVED', receivedAt: new Date(), pickupStatus: 'PICKED_UP' }, include: returnInclude });
  }
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

  /** Refunds `amount` of an order's captured payment at the provider and records it. `inTx` lets a
   * caller update related rows atomically with the PROCESSED refund (e.g. a return request). */
  private async issueRefund<T = null>(
    input: { orderId: number; amount: number; reason: string; adminId?: number; inTx?: (tx: Prisma.TransactionClient) => Promise<T> },
  ) {
    const { orderId, amount, reason } = input;
    const actor = input.adminId ? { type: 'ADMIN' as const, id: input.adminId } : undefined;

    // 1. reserve the amount as a PENDING refund so concurrent requests can't over-refund
    const { transaction, refund } = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.findFirst({ where: { orderId, status: 'CAPTURED' }, orderBy: { createdAt: 'desc' } });
      if (!transaction) throw new ConflictException('No captured payment transaction is available');
      const aggregate = await tx.paymentRefund.aggregate({ where: { transactionId: transaction.id, status: { in: ['PENDING', 'PROCESSED'] } }, _sum: { amount: true } });
      if (Number(aggregate._sum.amount ?? 0) + amount > Number(transaction.amount) + 0.001) throw new BadRequestException('Refund exceeds the remaining captured amount');
      const refund = await tx.paymentRefund.create({ data: { transactionId: transaction.id, orderId, amount, reason } });
      return { transaction, refund };
    });
    await this.audit.log({ action: 'refund.requested', entity: 'PaymentRefund', entityId: refund.id, actor, meta: { orderId, amount, reason, provider: transaction.provider } });

    // 2. money moves at the provider, outside any DB transaction
    let providerRefund: { id: string; status: string } | null;
    try {
      providerRefund = await this.refundAtProvider(transaction, refund.id, amount);
    } catch (error) {
      await this.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
      await this.audit.log({ action: 'refund.failed', entity: 'PaymentRefund', entityId: refund.id, actor, meta: { error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }

    // 3. record the outcome
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.paymentRefund.update({ where: { id: refund.id }, data: { status: 'PROCESSED', providerRefundId: providerRefund?.id, rawPayload: providerRefund ?? undefined } });
      const refunded = await tx.paymentRefund.aggregate({ where: { transactionId: transaction.id, status: 'PROCESSED' }, _sum: { amount: true } });
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: Number(refunded._sum.amount ?? 0) >= Number(transaction.amount) - 0.001 ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      const extra = input.inTx ? await input.inTx(tx) : (null as T);
      return { extra, refund: await tx.paymentRefund.findUniqueOrThrow({ where: { id: refund.id } }) };
    });
    await this.audit.log({ action: 'refund.processed', entity: 'PaymentRefund', entityId: refund.id, actor, meta: { providerRefundId: providerRefund?.id ?? null } });
    return result;
  }

  async refund(id: number, dto: RefundReturnDto, adminId?: number) {
    const item = await this.findReturn(id); this.requireStatus(item.returnStatus, ['RECEIVED']);
    if (dto.refundAmount > Number(item.orderItem.subtotal)) throw new BadRequestException('Refund exceeds the order item subtotal');
    const { extra: returnRequest, refund } = await this.issueRefund({
      orderId: item.orderItem.orderId, amount: dto.refundAmount, reason: `Return request ${id}`, adminId,
      inTx: (tx) => tx.orderItemReturn.update({ where: { id }, data: { refundAmount: dto.refundAmount, returnStatus: 'REFUNDED', refundedAt: new Date() }, include: returnInclude }),
    });
    this.sendRefundEmail(item.orderItem.order.orderNumber, item.orderItem.order.email, dto.refundAmount);
    return { returnRequest, refund };
  }

  /** Refunds part or all of an order's payment straight from the order screen. */
  async refundOrder(orderId: number, dto: RefundOrderDto, adminId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, email: true } });
    if (!order) throw new NotFoundException('Order not found');
    const { refund } = await this.issueRefund({ orderId, amount: dto.amount, reason: dto.reason?.trim() || 'Refund issued by admin', adminId });
    this.sendRefundEmail(order.orderNumber, order.email, dto.amount);
    return { refund };
  }

  private sendRefundEmail(orderNumber: string, to: string, amount: number) {
    const email = orderRefundedEmail({ orderNumber, refundAmount: amount.toFixed(2) });
    void this.emailService.send(to, email.subject, email.html);
  }
  async listTransactions(query: ListTransactionsQueryDto) {
    const page = query.page!; const perPage = query.perPage!; const where = { ...(query.orderId ? { orderId: query.orderId } : {}), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([this.prisma.paymentTransaction.findMany({ where, ...paginationSkipTake(page, perPage), include: { order: true, refunds: true, disputes: true }, orderBy: { createdAt: 'desc' } }), this.prisma.paymentTransaction.count({ where })]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
  async listDisputes(query: ListDisputesQueryDto) {
    const page = query.page!; const perPage = query.perPage!; const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([this.prisma.paymentDispute.findMany({ where, ...paginationSkipTake(page, perPage), include: { order: true, transaction: true }, orderBy: { createdAt: 'desc' } }), this.prisma.paymentDispute.count({ where })]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
  async updateDispute(id: number, dto: UpdateDisputeDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('Provide at least one field');
    const exists = await this.prisma.paymentDispute.findUnique({ where: { id } }); if (!exists) throw new NotFoundException('Payment dispute not found');
    return this.prisma.paymentDispute.update({ where: { id }, data: dto, include: { order: true, transaction: true } });
  }
}
