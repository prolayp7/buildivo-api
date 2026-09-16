import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';
import { PaymentAttemptsService } from './payment-attempts.service';
import { PaypalGatewayService } from './paypal-gateway.service';

const SIGNATURE_TOLERANCE_SECONDS = 300;

interface StripeEvent {
  id: string;
  type: string;
  data?: { object?: { id?: string } };
}

interface PaypalEvent {
  id: string;
  event_type: string;
  resource?: Record<string, unknown>;
}

@Injectable()
export class PaymentWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly paypalGateway: PaypalGatewayService,
    private readonly attempts: PaymentAttemptsService,
  ) {}

  private verifyStripeSignature(rawBody: Buffer, header: string, secret: string): boolean {
    const parts = new Map(
      header.split(',').map((pair) => {
        const [key, value] = pair.split('=');
        return [key, value];
      }),
    );
    const timestamp = parts.get('t');
    const signature = parts.get('v1');
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      return false;
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    return ageSeconds <= SIGNATURE_TOLERANCE_SECONDS;
  }

  async handleStripe(rawBody: Buffer, signatureHeader: string | undefined): Promise<{ received: true }> {
    if (!signatureHeader) throw new BadRequestException('Missing Stripe-Signature header');

    const integration = await this.settings.internalIntegration('payment.stripe');
    const webhookSecret = integration?.settings?.webhookSecret;
    if (!integration || typeof webhookSecret !== 'string' || !webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhooks are not configured');
    }
    if (!this.verifyStripeSignature(rawBody, signatureHeader, webhookSecret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }
    if (!event.id || !event.type) throw new BadRequestException('Malformed event');

    // Idempotent by provider event id: a replayed webhook (the provider retries
    // on anything but a 2xx) is logged once and never reprocessed.
    try {
      await this.prisma.paymentWebhookLog.create({
        data: {
          provider: 'STRIPE',
          eventType: event.type,
          providerEventId: event.id,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { received: true };
      }
      throw error;
    }

    await this.applyEvent(event);
    await this.prisma.paymentWebhookLog.update({
      where: { providerEventId: event.id },
      data: { processedAt: new Date() },
    });
    return { received: true };
  }

  // ponytail: only payment_intent.succeeded/payment_failed and
  // checkout.session.completed are handled; anything else is logged (for
  // idempotency/audit) and otherwise ignored. Extend here as new event types
  // are actually wired to a caller-side flow.
  private async applyEvent(event: StripeEvent): Promise<void> {
    const providerObjectId = event.data?.object?.id;
    if (!providerObjectId) return;

    const succeeded = event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed';
    const failed = event.type === 'payment_intent.payment_failed';
    if (!succeeded && !failed) return;

    const attempt = await this.prisma.paymentAttempt.findFirst({ where: { provider: 'STRIPE', providerObjectId } });
    if (!attempt) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: succeeded ? 'CAPTURED' : 'FAILED' },
      });

      const order = await tx.order.findUnique({ where: { id: attempt.orderId } });
      if (!order || order.paymentStatus === 'PAID') return;

      if (succeeded) {
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            paymentAttemptId: attempt.id,
            provider: 'STRIPE',
            providerTransactionId: providerObjectId,
            amount: attempt.amount,
            currency: attempt.currency,
            status: 'CAPTURED',
          },
        });
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', status: 'PROCESSING' } });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: order.status, toStatus: 'PROCESSING', note: 'Payment captured via webhook' },
        });
      } else {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED', status: 'FAILED' } });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: order.status, toStatus: 'FAILED', note: 'Payment failed via webhook' },
        });
      }
    });
  }

  // PayPal signs webhooks with a per-request certificate + transmission
  // headers, verified via PayPal's own verify-webhook-signature API - unlike
  // Stripe's local HMAC, this call must round-trip to PayPal.
  async handlePaypal(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<{ received: true }> {
    const creds = await this.paypalGateway.credentials();

    let event: PaypalEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }
    if (!event.id || !event.event_type) throw new BadRequestException('Malformed event');

    const accessToken = await this.paypalGateway.accessToken(creds);
    const verified = await this.paypalGateway.verifyWebhookSignature(creds, accessToken, headers, event);
    if (!verified) throw new BadRequestException('Invalid webhook signature');

    // Idempotent by provider event id, same as the Stripe handler above.
    try {
      await this.prisma.paymentWebhookLog.create({
        data: {
          provider: 'PAYPAL',
          eventType: event.event_type,
          providerEventId: event.id,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { received: true };
      }
      throw error;
    }

    await this.applyPaypalEvent(event);
    await this.prisma.paymentWebhookLog.update({
      where: { providerEventId: event.id },
      data: { processedAt: new Date() },
    });
    return { received: true };
  }

  // ponytail: only PAYMENT.CAPTURE.COMPLETED/DENIED are handled, mirroring
  // the Stripe handler's narrow scope - extend here as more event types are
  // actually wired to a caller-side flow. The real state transition is
  // shared with the direct capture endpoint via PaymentAttemptsService, so
  // whichever of the two fires first wins and the other is a no-op.
  private async applyPaypalEvent(event: PaypalEvent): Promise<void> {
    const completed = event.event_type === 'PAYMENT.CAPTURE.COMPLETED';
    const denied = event.event_type === 'PAYMENT.CAPTURE.DENIED';
    if (!completed && !denied) return;

    const resource = event.resource ?? {};
    const relatedIds = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
    const paypalOrderId = relatedIds?.order_id;
    const captureId = typeof resource.id === 'string' ? resource.id : undefined;
    if (!paypalOrderId) return;

    const attempt = await this.attempts.findByProviderObjectId('PAYPAL', paypalOrderId);
    if (!attempt) return;

    await this.attempts.finalizeCapture(
      attempt.id,
      completed ? { captured: true, providerTransactionId: captureId ?? paypalOrderId } : { captured: false },
    );
  }
}
