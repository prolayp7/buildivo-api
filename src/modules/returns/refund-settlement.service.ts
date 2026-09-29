import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { orderRefundedEmail } from '../email/email-templates';
import { ReturnActor, ReturnsCoreService } from './returns-core.service';

export type RefundOutcome = 'PROCESSED' | 'PROCESSING' | 'FAILED';

/** How a provider's refund status maps onto ours. Anything not clearly final stays PROCESSING. */
export function refundOutcome(providerStatus: string | null | undefined): RefundOutcome {
  const status = (providerStatus ?? '').toLowerCase();
  if (status === 'succeeded' || status === 'completed') return 'PROCESSED';
  if (status === 'failed' || status === 'canceled' || status === 'cancelled' || status === 'denied') return 'FAILED';
  return 'PROCESSING';
}

/** The one place a refund becomes final. Called when the provider answers the refund request directly
 * and again from payment webhooks, so it is idempotent: a refund already in the target state is left alone.
 * A refund only counts as successful once the provider has confirmed it. */
@Injectable()
export class RefundSettlementService {
  private readonly logger = new Logger(RefundSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: ReturnsCoreService,
    private readonly emailService: EmailService,
  ) {}

  async settle(refundId: number, outcome: 'PROCESSED' | 'FAILED', input: { providerRefundId?: string | null; payload?: unknown; failureReason?: string | null; actor: ReturnActor }): Promise<void> {
    const refund = await this.prisma.paymentRefund.findUnique({ where: { id: refundId }, include: { order: { select: { id: true, orderNumber: true, email: true } } } });
    if (!refund || refund.status === outcome || refund.status === 'PROCESSED') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentRefund.update({
        where: { id: refundId },
        data: {
          status: outcome,
          ...(input.providerRefundId ? { providerRefundId: input.providerRefundId } : {}),
          ...(input.payload !== undefined ? { rawPayload: input.payload as Prisma.InputJsonValue } : {}),
          ...(outcome === 'PROCESSED' ? { processedAt: new Date(), failureReason: null } : { failureReason: input.failureReason?.slice(0, 1000) ?? 'The payment provider declined the refund' }),
        },
      });
      if (outcome === 'PROCESSED') await this.applyPaymentStatus(tx, refund.transactionId, refund.orderId);

      if (refund.returnRequestId) {
        if (outcome === 'PROCESSED') {
          // Every refund of this return must be confirmed before the return is complete.
          const open = await tx.paymentRefund.count({ where: { returnRequestId: refund.returnRequestId, status: { in: ['PENDING', 'PROCESSING'] }, id: { not: refundId } } });
          if (!open) {
            await this.core.setStatus(tx, refund.returnRequestId, 'COMPLETED', { action: 'refund.completed', note: `Refund of ${Number(refund.amount).toFixed(2)} confirmed by the payment provider`, actor: input.actor });
            await this.core.settleOrderStatus(tx, refund.orderId, input.actor);
          }
        } else {
          // Back to "refund approved" so an admin can retry.
          await this.core.setStatus(tx, refund.returnRequestId, 'REFUND_APPROVED', { action: 'refund.failed', note: input.failureReason ?? 'The payment provider declined the refund', actor: input.actor });
        }
      }
    });

    if (outcome === 'PROCESSED') {
      const email = orderRefundedEmail({ orderNumber: refund.order.orderNumber, refundAmount: Number(refund.amount).toFixed(2) });
      void this.emailService.send(refund.order.email, email.subject, email.html);
    } else {
      this.logger.warn(`Refund ${refundId} failed: ${input.failureReason ?? 'declined'}`);
    }
  }

  /** Payment status follows confirmed refunds only. */
  private async applyPaymentStatus(tx: Prisma.TransactionClient | PrismaClient, transactionId: number, orderId: number) {
    const [transaction, refunded] = await Promise.all([
      tx.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId }, select: { amount: true } }),
      tx.paymentRefund.aggregate({ where: { transactionId, status: 'PROCESSED' }, _sum: { amount: true } }),
    ]);
    const total = Number(refunded._sum.amount ?? 0);
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: total >= Number(transaction.amount) - 0.001 ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
  }
}
