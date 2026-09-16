import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export const deliveryCarriers = ['FEDEX', 'EVRI'] as const;
export type DeliveryCarrier = typeof deliveryCarriers[number];

type TokenResponse = { access_token?: string; expires_in?: number; token_type?: string; error?: string; error_description?: string };

@Injectable()
export class CarrierGatewaysService {
  constructor(private readonly settingsService: SettingsService) {}

  async test(carrier: DeliveryCarrier) {
    const scope = carrier === 'FEDEX' ? 'delivery.fedex' : 'delivery.evri';
    const integration = await this.settingsService.internalIntegration(scope);
    if (!integration) throw new ServiceUnavailableException(`${carrier} is not configured`);
    const clientId = this.requiredString(integration.settings, 'clientId');
    const clientSecret = this.requiredString(integration.settings, 'clientSecret');
    const url = carrier === 'FEDEX'
      ? `${integration.mode === 'LIVE' ? 'https://apis.fedex.com' : 'https://apis-sandbox.fedex.com'}/oauth/token`
      : this.evriTokenUrl(integration.settings, integration.mode);
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'request timed out' : 'network connection failed';
      throw new BadGatewayException(`${carrier} authentication ${reason}`);
    }
    const payload = await this.json(response);
    if (!response.ok || !payload.access_token) {
      throw new BadGatewayException({
        message: `${carrier} rejected the configured credentials`,
        providerStatus: response.status,
        providerCode: payload.error ?? null,
        providerMessage: payload.error_description ?? null,
      });
    }
    return {
      carrier,
      mode: integration.mode,
      connected: true,
      latencyMs: Date.now() - startedAt,
      tokenExpiresInSeconds: payload.expires_in ?? null,
    };
  }

  private requiredString(settings: Record<string, unknown>, key: string) {
    const value = settings[key];
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`Carrier setting ${key} is required`);
    return value;
  }

  private evriTokenUrl(settings: Record<string, unknown>, mode: 'SANDBOX' | 'LIVE') {
    const configured = settings.tokenUrl;
    if (configured !== undefined) {
      if (typeof configured !== 'string' || !configured.startsWith('https://')) throw new BadRequestException('Carrier setting tokenUrl must be HTTPS');
      return configured;
    }
    return mode === 'LIVE'
      ? 'https://api.business.evri.com/.p2g/oauth/token'
      : 'https://api.business.evri.com/.p2g/oauth/token';
  }

  private async json(response: Response): Promise<TokenResponse> {
    try { return await response.json() as TokenResponse; }
    catch { return {}; }
  }
}
