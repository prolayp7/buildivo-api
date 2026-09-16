import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ApproveReturnDto } from './dto/approve-return.dto';
import { ListDisputesQueryDto } from './dto/list-disputes-query.dto';
import { ListReturnsQueryDto } from './dto/list-returns-query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { RefundReturnDto } from './dto/refund-return.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { EmailService } from '../../email/email.service';
import { orderRefundedEmail } from '../../email/email-templates';

const returnInclude = { user: { select: { id: true, email: true, firstName: true, lastName: true } }, orderItem: { include: { order: true, product: true, productVariant: true } } };

@Injectable()
export class PaymentOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
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
  async refund(id: number, dto: RefundReturnDto) {
    const item = await this.findReturn(id); this.requireStatus(item.returnStatus, ['RECEIVED']);
    if (dto.refundAmount > Number(item.orderItem.subtotal)) throw new BadRequestException('Refund exceeds the order item subtotal');
    const orderId = item.orderItem.orderId;
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.findFirst({ where: { orderId, status: 'CAPTURED' }, orderBy: { createdAt: 'desc' } });
      if (!transaction) throw new ConflictException('No captured payment transaction is available');
      const aggregate = await tx.paymentRefund.aggregate({ where: { transactionId: transaction.id, status: { in: ['PENDING', 'PROCESSED'] } }, _sum: { amount: true } });
      if (Number(aggregate._sum.amount ?? 0) + dto.refundAmount > Number(transaction.amount)) throw new BadRequestException('Refund exceeds the remaining captured amount');
      const refund = await tx.paymentRefund.create({ data: { transactionId: transaction.id, orderId, amount: dto.refundAmount, reason: `Return request ${id}` } });
      const returnRequest = await tx.orderItemReturn.update({ where: { id }, data: { refundAmount: dto.refundAmount, returnStatus: 'REFUNDED', refundedAt: new Date() }, include: returnInclude });
      return { returnRequest, refund };
    }).then((result) => {
      const email = orderRefundedEmail({ orderNumber: item.orderItem.order.orderNumber, refundAmount: dto.refundAmount.toFixed(2) });
      void this.emailService.send(item.orderItem.order.email, email.subject, email.html);
      return result;
    });
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
