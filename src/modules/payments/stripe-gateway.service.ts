import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../admin/settings/settings.service';

export interface StripeCredentials {
  mode: 'SANDBOX' | 'LIVE';
  secretKey: string;
}

// Stripe's REST API directly (form-urlencoded, unlike PayPal/JSON) - same
// fetch-based pattern as PaypalGatewayService, no SDK dependency. Payment
// confirmation itself happens client-side (Stripe.js, using the client_secret
// this returns); PaymentWebhooksService.handleStripe already applies the
// resulting payment_intent.succeeded/payment_failed events.
@Injectable()
export class StripeGatewayService {
  constructor(private readonly settingsService: SettingsService) {}

  async credentials(): Promise<StripeCredentials> {
    const integration = await this.settingsService.internalIntegration('payment.stripe');
    if (!integration) throw new ServiceUnavailableException('Stripe is not configured');
    return { mode: integration.mode, secretKey: this.requiredString(integration.settings, 'secretKey') };
  }

  async createPaymentIntent(
    creds: Pick<StripeCredentials, 'secretKey'>,
    input: { amount: string; currency: string; referenceId: string },
  ): Promise<{ id: string; clientSecret: string }> {
    // Stripe amounts are in the currency's smallest unit (pence for GBP).
    const minorUnits = Math.round(Number(input.amount) * 100);
    const body = await this.request(creds.secretKey, '/v1/payment_intents', {
      amount: String(minorUnits),
      currency: input.currency.toLowerCase(),
      'metadata[reference_id]': input.referenceId,
      'automatic_payment_methods[enabled]': 'true',
    });
    if (typeof body.id !== 'string' || typeof body.client_secret !== 'string') {
      throw new BadGatewayException('Stripe did not return a payment intent id and client secret');
    }
    return { id: body.id, clientSecret: body.client_secret };
  }

  private async request(secretKey: string, path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`https://api.stripe.com${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new BadGatewayException(`Stripe request ${this.reasonFor(error)}`);
    }
    const payload = await this.json<Record<string, unknown>>(response);
    if (!response.ok) {
      throw new BadGatewayException({ message: 'Stripe request failed', providerStatus: response.status, providerBody: payload });
    }
    return payload;
  }

  private reasonFor(error: unknown): string {
    return error instanceof Error && error.name === 'TimeoutError' ? 'request timed out' : 'network connection failed';
  }

  private requiredString(settings: Record<string, unknown>, key: string): string {
    const value = settings[key];
    if (typeof value !== 'string' || !value.trim()) throw new ServiceUnavailableException(`Stripe setting ${key} is not configured`);
    return value;
  }

  private async json<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }
}
