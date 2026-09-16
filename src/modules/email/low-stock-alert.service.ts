import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { notificationEmail } from './email-templates';
import { resolveAdminEmail } from './admin-email.util';

// Fire-and-forget, called after any stock mutation (admin manual edit,
// checkout decrement, cancel/return increment). Never throws - the caller
// (stock update / checkout) must never fail or wait because of this.
@Injectable()
export class LowStockAlertService {
  private readonly logger = new Logger(LowStockAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async checkAndNotify(variantId: number): Promise<void> {
    try {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true,
          title: true,
          stockQty: true,
          lowStockThreshold: true,
          lowStockAlertSentAt: true,
          product: { select: { title: true, receiveLowStockAlert: true } },
        },
      });
      if (!variant || !variant.product.receiveLowStockAlert) return;

      const isLow = variant.stockQty <= variant.lowStockThreshold;
      if (!isLow) {
        if (variant.lowStockAlertSentAt) {
          await this.prisma.productVariant.update({ where: { id: variantId }, data: { lowStockAlertSentAt: null } });
        }
        return;
      }
      if (variant.lowStockAlertSentAt) return; // already alerted for this dip

      const to = await resolveAdminEmail(this.prisma);
      if (!to) return;
      const { subject, html } = notificationEmail({
        title: 'Low stock alert',
        message: `${variant.product.title} — ${variant.title} is down to ${variant.stockQty} unit(s), at or below its threshold of ${variant.lowStockThreshold}.`,
      });
      await this.email.send(to, subject, html);
      await this.prisma.productVariant.update({ where: { id: variantId }, data: { lowStockAlertSentAt: new Date() } });
    } catch (error) {
      this.logger.warn(`Low-stock alert check failed for variant ${variantId}: ${(error as Error).message}`);
    }
  }
}
