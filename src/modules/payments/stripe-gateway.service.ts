import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../admin/settings/settings.service';

// Stripe Checkout (hosted page) over Stripe's REST API - form-encoded bodies,
// secret key as bearer. Sandbox vs live is decided by the key itself.
@Injectable()
export class StripeGatewayService {
  constructor(private readonly settingsService: SettingsService) {}

  async secretKey(): Promise<string> {
    const integration = await this.settingsService.internalIntegration('payment.stripe');
    const key = integration?.settings?.secretKey;
    if (typeof key !== 'string' || !key.trim()) throw new ServiceUnavailableException('Stripe is not configured');
    return key;
  }

  async createCheckoutSession(
    secretKey: string,
    input: { amount: string; currency: string; referenceId: string; email: string; description: string; successUrl: string; cancelUrl: string },
  ): Promise<{ id: string; url: string }> {
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.email,
      client_reference_id: input.referenceId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(Math.round(Number(input.amount) * 100)),
      'line_items[0][price_data][product_data][name]': input.description,
    });
    const payload = await this.request(secretKey, 'POST', '/v1/checkout/sessions', body);
    if (typeof payload.id !== 'string' || typeof payload.url !== 'string') {
      throw new BadGatewayException('Stripe did not return a checkout session');
    }
    return { id: payload.id, url: payload.url };
  }

  async retrieveSession(secretKey: string, sessionId: string): Promise<{ paid: boolean; paymentIntent: string | null; paid_amount?: string; paid_currency?: string }> {
    const payload = await this.request(secretKey, 'GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const total = typeof payload.amount_total === 'number' ? (payload.amount_total / 100).toFixed(2) : undefined;
    return {
      paid: payload.payment_status === 'paid',
      paymentIntent: typeof payload.payment_intent === 'string' ? payload.payment_intent : null,
      paid_amount: total,
      paid_currency: typeof payload.currency === 'string' ? payload.currency.toUpperCase() : undefined,
    };
  }

  /** Refunds part/all of a PaymentIntent. The idempotency key makes a retry safe (no double refund). */
  async refund(secretKey: string, input: { paymentIntent: string; amount: string; idempotencyKey: string }): Promise<{ id: string; status: string }> {
    const payload = await this.request(
      secretKey, 'POST', '/v1/refunds',
      new URLSearchParams({ payment_intent: input.paymentIntent, amount: String(Math.round(Number(input.amount) * 100)) }),
      { 'idempotency-key': input.idempotencyKey },
    );
    if (typeof payload.id !== 'string') throw new BadGatewayException('Stripe did not return a refund');
    return { id: payload.id, status: String(payload.status) };
  }

  private async request(secretKey: string, method: 'GET' | 'POST', path: string, body?: URLSearchParams, extraHeaders: Record<string, string> = {}): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`https://api.stripe.com${path}`, {
        method,
        headers: { authorization: `Bearer ${secretKey}`, ...extraHeaders, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new BadGatewayException(`Stripe request ${error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'network connection failed'}`);
    }
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BadGatewayException({ message: 'Stripe request failed', providerStatus: response.status, providerBody: payload });
    return payload;
  }
}
