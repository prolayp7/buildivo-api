import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../admin/settings/settings.service';

export interface PaypalCredentials {
  mode: 'SANDBOX' | 'LIVE';
  clientId: string;
  clientSecret: string;
  webhookId: string;
}

interface PaypalLink {
  rel: string;
  href: string;
}

// PayPal's REST APIs - Orders v2 (create/capture) and the webhook signature
// verification endpoint. Same client-credentials + fetch pattern as
// CarrierGatewaysService (FedEx/Evri), adapted for JSON bodies.
@Injectable()
export class PaypalGatewayService {
  constructor(private readonly settingsService: SettingsService) {}

  async credentials(): Promise<PaypalCredentials> {
    const integration = await this.settingsService.internalIntegration('payment.paypal');
    if (!integration) throw new ServiceUnavailableException('PayPal is not configured');
    return {
      mode: integration.mode,
      clientId: this.requiredString(integration.settings, 'clientId'),
      clientSecret: this.requiredString(integration.settings, 'clientSecret'),
      // Only needed to verify incoming PayPal webhooks (see
      // verifyWebhookSignature below) - order creation/capture don't use it,
      // so an admin can accept payments before setting up a webhook.
      webhookId: this.optionalString(integration.settings, 'webhookId'),
    };
  }

  private baseUrl(mode: 'SANDBOX' | 'LIVE'): string {
    return mode === 'LIVE' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  async accessToken(creds: Pick<PaypalCredentials, 'mode' | 'clientId' | 'clientSecret'>): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl(creds.mode)}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new BadGatewayException(`PayPal authentication ${this.reasonFor(error)}`);
    }
    const payload = await this.json<{ access_token?: string; error?: string; error_description?: string }>(response);
    if (!response.ok || !payload.access_token) {
      throw new BadGatewayException({
        message: 'PayPal rejected the configured credentials',
        providerStatus: response.status,
        providerCode: payload.error ?? null,
        providerMessage: payload.error_description ?? null,
      });
    }
    return payload.access_token;
  }

  async createOrder(
    creds: Pick<PaypalCredentials, 'mode'>,
    accessToken: string,
    input: { amount: string; currency: string; referenceId: string; returnUrl: string; cancelUrl: string },
  ): Promise<{ id: string; approveUrl: string }> {
    const body = await this.request(creds.mode, accessToken, '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: input.referenceId, amount: { currency_code: input.currency, value: input.amount } }],
      application_context: { return_url: input.returnUrl, cancel_url: input.cancelUrl, user_action: 'PAY_NOW' },
    });
    const approveUrl = (body.links as PaypalLink[] | undefined)?.find((link) => link.rel === 'approve')?.href;
    if (typeof body.id !== 'string' || !approveUrl) {
      throw new BadGatewayException('PayPal did not return an order id and approval link');
    }
    return { id: body.id, approveUrl };
  }

  async captureOrder(
    creds: Pick<PaypalCredentials, 'mode'>,
    accessToken: string,
    paypalOrderId: string,
  ): Promise<{ status: string; captureId: string | null }> {
    const body = await this.request(creds.mode, accessToken, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {});
    const captures = (body.purchase_units as { payments?: { captures?: { id?: string }[] } }[] | undefined)?.[0]?.payments?.captures;
    return { status: typeof body.status === 'string' ? body.status : 'UNKNOWN', captureId: captures?.[0]?.id ?? null };
  }

  async verifyWebhookSignature(
    creds: PaypalCredentials,
    accessToken: string,
    headers: Record<string, string | undefined>,
    webhookEvent: unknown,
  ): Promise<boolean> {
    const authAlgo = headers['paypal-auth-algo'];
    const certUrl = headers['paypal-cert-url'];
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const transmissionTime = headers['paypal-transmission-time'];
    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return false;

    const body = await this.request(creds.mode, accessToken, '/v1/notifications/verify-webhook-signature', {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: creds.webhookId,
      webhook_event: webhookEvent,
    });
    return body.verification_status === 'SUCCESS';
  }

  private async request(mode: 'SANDBOX' | 'LIVE', accessToken: string, path: string, body: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl(mode)}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new BadGatewayException(`PayPal request ${this.reasonFor(error)}`);
    }
    const payload = await this.json<Record<string, unknown>>(response);
    if (!response.ok) {
      throw new BadGatewayException({ message: 'PayPal request failed', providerStatus: response.status, providerBody: payload });
    }
    return payload;
  }

  private reasonFor(error: unknown): string {
    return error instanceof Error && error.name === 'TimeoutError' ? 'request timed out' : 'network connection failed';
  }

  private requiredString(settings: Record<string, unknown>, key: string): string {
    const value = settings[key];
    if (typeof value !== 'string' || !value.trim()) throw new ServiceUnavailableException(`PayPal setting ${key} is not configured`);
    return value;
  }

  private optionalString(settings: Record<string, unknown>, key: string): string {
    const value = settings[key];
    return typeof value === 'string' ? value : '';
  }

  private async json<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }
}
