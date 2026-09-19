import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { withLease } from '../../../common/lease';
import { PrismaService } from '../../../prisma/prisma.service';

const SWEEP_MS = 5 * 60 * 1000;
const holdMinutes = () => Number(process.env.UNPAID_ORDER_HOLD_MINUTES ?? 60);

/** Releases stock held by orders that were never paid. Orders are created before
 * payment (stock is decremented then), so abandoned checkouts must expire. */
@Injectable()
export class OrderExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e)), SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Cancels stale unpaid orders and restocks them; returns how many. */
  async sweep(): Promise<number> {
    return (await withLease(this.prisma, 727301, () => this.expireStale())) ?? 0;
  }

  private async expireStale(): Promise<number> {
    const cutoff = new Date(Date.now() - holdMinutes() * 60_000);
    const stale = await this.prisma.order.findMany({
      where: { status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING', placedAt: { lt: cutoff } },
      include: { items: true },
    });
    let expired = 0;
    for (const order of stale) {
      await this.prisma.$transaction(async (tx) => {
        // guard on status so a payment landing mid-sweep (or another instance) wins
        const { count } = await tx.order.updateMany({ where: { id: order.id, status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING' }, data: { status: 'CANCELLED' } });
        if (!count) return;
        await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: 'AWAITING_PAYMENT', toStatus: 'CANCELLED', note: 'Payment not received in time - stock released' } });
        for (const item of order.items) {
          await tx.productVariant.update({ where: { id: item.productVariantId }, data: { stockQty: { increment: item.quantity } } });
        }
        expired += 1;
      });
    }
    if (expired) this.logger.log(`Expired ${expired} unpaid order(s)`);
    return expired;
  }
}
