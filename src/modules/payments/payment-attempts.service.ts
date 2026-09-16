import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentAttemptDto, PaymentProvider, paymentProviders } from './dto/create-payment-attempt.dto';
import { PaymentStateService } from './payment-state.service';
import { PaypalGatewayService } from './paypal-gateway.service';
import { StripeGatewayService } from './stripe-gateway.service';

const payableOrderStatuses = ['PENDING', 'AWAITING_PAYMENT', 'FAILED'] as const;
type StoredIntegrationFlags = { enabled?: boolean };

function settingKeyFor(provider: PaymentProvider): string {
  return `integration.payment.${provider === 'TWOCHECKOUT' ? '2checkout' : provider.toLowerCase()}`;
}
const terminalAttemptStatuses = ['CAPTURED', 'FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED'];
type OrderRow = { id: number; uuid: string; total: Prisma.Decimal; payment_status: string; status: string };
type AttemptRow = {
  id: number; uuid: string; order_id: number; provider: PaymentProvider; status: string; amount: Prisma.Decimal;
  currency: string; provider_object_id: string | null; redirect_url: string | null; client_secret: string | null;
  failure_code: string | null; failure_message: string | null; retryable: boolean; expires_at: Date | null;
};

@Injectable()
export class PaymentAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentState: PaymentStateService,
    private readonly paypalGateway: PaypalGatewayService,
    private readonly stripeGateway: StripeGatewayService,
  ) {}

  async create(dto: CreatePaymentAttemptDto, idempotencyKey: string) {
    const row = await this.prisma.setting.findUnique({ where: { key: settingKeyFor(dto.provider) }, select: { value: true } });
    const enabled = Boolean(row) && ((row?.value as unknown as StoredIntegrationFlags)?.enabled ?? true);
    if (!enabled) throw new ServiceUnavailableException(`${dto.provider} payments are not configured`);
    const [order] = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT id, uuid, total, payment_status, status::text
      FROM orders WHERE uuid = ${dto.orderUuid} AND lower(email) = lower(${dto.email}) LIMIT 1
    `;
    if (!order) throw new NotFoundException('Order not found');
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.payment_status)) {
      throw new ConflictException('This order has already been paid');
    }
    if (!payableOrderStatuses.includes(order.status as typeof payableOrderStatuses[number])) {
      throw new ConflictException(`Order cannot be paid while it is ${order.status}`);
    }

    const [existing] = await this.findByIdempotency(dto.provider, idempotencyKey);
    if (existing) {
      if (existing.order_id !== order.id) throw new ConflictException('Idempotency key was already used for another order');
      return this.present(await this.ensureProviderIntent(existing), order.uuid);
    }

    const attempt = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<AttemptRow[]>`
        INSERT INTO payment_attempts (uuid, order_id, provider, idempotency_key, amount, currency, updated_at)
        VALUES (${randomUUID()}, ${order.id}, CAST(${dto.provider} AS "PaymentProvider"), ${idempotencyKey}, ${order.total}, 'GBP', NOW())
        ON CONFLICT (provider, idempotency_key) DO NOTHING
        RETURNING id, uuid, order_id, provider::text, status::text, amount, currency, provider_object_id, redirect_url,
                  client_secret, failure_code, failure_message, retryable, expires_at
      `;
      if (inserted[0]) {
        await tx.$executeRaw`
          INSERT INTO payment_state_history (payment_attempt_id, to_status, source, reason)
          VALUES (${inserted[0].id}, 'CREATED', 'CUSTOMER_API', 'Payment attempt created')
        `;
        return inserted[0];
      }
      const raced = await tx.$queryRaw<AttemptRow[]>`
        SELECT id, uuid, order_id, provider::text, status::text, amount, currency, provider_object_id, redirect_url,
               client_secret, failure_code, failure_message, retryable, expires_at
        FROM payment_attempts
        WHERE provider = CAST(${dto.provider} AS "PaymentProvider") AND idempotency_key = ${idempotencyKey}
      `;
      if (!raced[0] || raced[0].order_id !== order.id) throw new ConflictException('Idempotency key was already used');
      return raced[0];
    });
    return this.present(await this.ensureProviderIntent(attempt), order.uuid);
  }

  /** Capture a PayPal order directly after the customer approves it - the
   * frontend calls this right after PayPal's return redirect, so the
   * customer gets an immediate result without waiting on the webhook.
   * The webhook (see PaymentWebhooksService) applies the same outcome
   * idempotently as a reconciliation safety net. */
  async capture(uuid: string, email: string) {
    const [attempt] = await this.prisma.$queryRaw<(AttemptRow & { order_uuid: string })[]>`
      SELECT pa.id, pa.uuid, pa.order_id, pa.provider::text, pa.status::text, pa.amount, pa.currency,
             pa.provider_object_id, pa.redirect_url, pa.client_secret, pa.failure_code, pa.failure_message,
             pa.retryable, pa.expires_at, o.uuid AS order_uuid
      FROM payment_attempts pa JOIN orders o ON o.id = pa.order_id
      WHERE pa.uuid = ${uuid} AND lower(o.email) = lower(${email}) LIMIT 1
    `;
    if (!attempt) throw new NotFoundException('Payment attempt not found');
    if (attempt.provider !== 'PAYPAL') throw new BadRequestException('Only PayPal payment attempts can be captured directly');
    if (attempt.status === 'CAPTURED') return this.present(attempt, attempt.order_uuid);
    if (!attempt.provider_object_id) throw new BadRequestException('This payment has not been created with PayPal yet');

    const creds = await this.paypalGateway.credentials();
    const accessToken = await this.paypalGateway.accessToken(creds);
    const result = await this.paypalGateway.captureOrder(creds, accessToken, attempt.provider_object_id);

    await this.finalizeCapture(
      attempt.id,
      result.status === 'COMPLETED'
        ? { captured: true, providerTransactionId: result.captureId ?? attempt.provider_object_id }
        : { captured: false },
    );

    const [updated] = await this.prisma.$queryRaw<AttemptRow[]>`
      SELECT id, uuid, order_id, provider::text, status::text, amount, currency, provider_object_id, redirect_url,
             client_secret, failure_code, failure_message, retryable, expires_at
      FROM payment_attempts WHERE id = ${attempt.id}
    `;
    return this.present(updated, attempt.order_uuid);
  }

  /** Shared success/failure outcome handler for a captured PayPal payment -
   * called from capture() above and from PaymentWebhooksService.handlePaypal,
   * so both paths converge on one idempotent transition + Order update. */
  async finalizeCapture(attemptId: number, outcome: { captured: boolean; providerTransactionId?: string }): Promise<void> {
    const current = await this.prisma.paymentAttempt.findUnique({ where: { id: attemptId }, select: { status: true } });
    if (!current || terminalAttemptStatuses.includes(current.status)) return; // already resolved - idempotent no-op

    await this.paymentState.transition(
      attemptId,
      outcome.captured ? 'CAPTURED' : 'FAILED',
      'PROVIDER_API',
      outcome.captured ? 'Payment captured via PayPal' : 'Payment failed or was declined via PayPal',
    );

    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt) return;
      const order = await tx.order.findUnique({ where: { id: attempt.orderId } });
      if (!order || order.paymentStatus === 'PAID') return;

      if (outcome.captured) {
        try {
          await tx.paymentTransaction.create({
            data: {
              orderId: order.id,
              paymentAttemptId: attempt.id,
              provider: attempt.provider,
              providerTransactionId: outcome.providerTransactionId ?? attempt.uuid,
              amount: attempt.amount,
              currency: attempt.currency,
              status: 'CAPTURED',
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return; // already recorded
          throw error;
        }
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', status: 'PROCESSING' } });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: order.status, toStatus: 'PROCESSING', note: 'Payment captured via PayPal' },
        });
      } else {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED', status: 'FAILED' } });
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: order.status, toStatus: 'FAILED', note: 'Payment failed via PayPal' },
        });
      }
    });
  }

  /** Looks up a PaymentAttempt by the provider's own order/intent id - used
   * by the webhook handler, which only ever sees the provider's id, not
   * ours. */
  async findByProviderObjectId(provider: PaymentProvider, providerObjectId: string) {
    const [attempt] = await this.prisma.$queryRaw<AttemptRow[]>`
      SELECT id, uuid, order_id, provider::text, status::text, amount, currency, provider_object_id, redirect_url,
             client_secret, failure_code, failure_message, retryable, expires_at
      FROM payment_attempts
      WHERE provider = CAST(${provider} AS "PaymentProvider") AND provider_object_id = ${providerObjectId}
      LIMIT 1
    `;
    return attempt ?? null;
  }

  /** Creates the real provider-side payment object for an attempt that
   * doesn't have one yet (a fresh attempt, or one from an earlier call that
   * crashed before this step completed). Idempotent no-op if
   * provider_object_id is already set. Dispatches by provider: PayPal gets a
   * redirect-based order, Stripe gets a PaymentIntent confirmed client-side. */
  private async ensureProviderIntent(attempt: AttemptRow): Promise<AttemptRow> {
    if (attempt.provider_object_id) return attempt;
    if (attempt.provider === 'PAYPAL') return this.ensurePaypalOrder(attempt);
    if (attempt.provider === 'STRIPE') return this.ensureStripeIntent(attempt);
    return attempt;
  }

  private async ensurePaypalOrder(attempt: AttemptRow): Promise<AttemptRow> {
    try {
      const creds = await this.paypalGateway.credentials();
      const accessToken = await this.paypalGateway.accessToken(creds);
      // no dedicated frontend return route exists yet - PayPal appends
      // ?token=<orderId>&PayerID=<id> to whichever URL is given here, so a
      // plain checkout link is enough for the frontend to read off later.
      const origin = process.env.STOREFRONT_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3002';
      const result = await this.paypalGateway.createOrder(creds, accessToken, {
        amount: Number(attempt.amount).toFixed(2),
        currency: attempt.currency,
        referenceId: attempt.uuid,
        returnUrl: `${origin}/checkout?paypalAttempt=${attempt.uuid}`,
        cancelUrl: `${origin}/checkout?paypalAttempt=${attempt.uuid}&paypalCancelled=1`,
      });
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { providerObjectId: result.id, redirectUrl: result.approveUrl },
      });
      return { ...attempt, provider_object_id: result.id, redirect_url: result.approveUrl };
    } catch (error) {
      await this.paymentState.transition(attempt.id, 'FAILED', 'PROVIDER_API', 'PayPal order creation failed').catch(() => {});
      throw error;
    }
  }

  private async ensureStripeIntent(attempt: AttemptRow): Promise<AttemptRow> {
    try {
      const creds = await this.stripeGateway.credentials();
      const result = await this.stripeGateway.createPaymentIntent(creds, {
        amount: Number(attempt.amount).toFixed(2),
        currency: attempt.currency,
        referenceId: attempt.uuid,
      });
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { providerObjectId: result.id, clientSecret: result.clientSecret },
      });
      return { ...attempt, provider_object_id: result.id, client_secret: result.clientSecret };
    } catch (error) {
      await this.paymentState.transition(attempt.id, 'FAILED', 'PROVIDER_API', 'Stripe payment intent creation failed').catch(() => {});
      throw error;
    }
  }

  async status(uuid: string, email: string) {
    const [attempt] = await this.prisma.$queryRaw<(AttemptRow & { order_uuid: string })[]>`
      SELECT pa.id, pa.uuid, pa.order_id, pa.provider::text, pa.status::text, pa.amount, pa.currency,
             pa.provider_object_id, pa.redirect_url, pa.client_secret, pa.failure_code, pa.failure_message,
             pa.retryable, pa.expires_at, o.uuid AS order_uuid
      FROM payment_attempts pa JOIN orders o ON o.id = pa.order_id
      WHERE pa.uuid = ${uuid} AND lower(o.email) = lower(${email}) LIMIT 1
    `;
    if (!attempt) throw new NotFoundException('Payment attempt not found');
    return this.present(attempt, attempt.order_uuid);
  }

  async methods() {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: paymentProviders.map(settingKeyFor) } },
      select: { key: true, value: true },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value as unknown as StoredIntegrationFlags]));
    return paymentProviders.map((provider) => {
      const stored = byKey.get(settingKeyFor(provider));
      return { provider, enabled: Boolean(stored) && (stored?.enabled ?? true) };
    });
  }

  private findByIdempotency(provider: PaymentProvider, idempotencyKey: string) {
    return this.prisma.$queryRaw<AttemptRow[]>`
      SELECT id, uuid, order_id, provider::text, status::text, amount, currency, provider_object_id, redirect_url,
             client_secret, failure_code, failure_message, retryable, expires_at
      FROM payment_attempts
      WHERE provider = CAST(${provider} AS "PaymentProvider") AND idempotency_key = ${idempotencyKey}
    `;
  }

  private present(attempt: AttemptRow, orderUuid: string) {
    return {
      attemptId: attempt.uuid,
      orderUuid,
      provider: attempt.provider,
      status: attempt.status,
      amount: attempt.amount,
      currency: attempt.currency,
      redirectUrl: attempt.redirect_url,
      clientSecret: attempt.client_secret,
      error: attempt.failure_code ? { code: attempt.failure_code, message: attempt.failure_message, retryable: attempt.retryable } : null,
      expiresAt: attempt.expires_at,
    };
  }
}
