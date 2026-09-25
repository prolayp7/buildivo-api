import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { paymentProviders, type PaymentProvider } from '../../payments/dto/create-payment-attempt.dto';
import { settingKeyFor } from '../../payments/payment-attempts.service';
import { normaliseFooter } from './footer-settings';

const GENERAL_SETTINGS_KEY = 'general.site';
export const FOOTER_SETTINGS_KEY = 'footer.site';
const GATEWAY_LABELS: Record<PaymentProvider, string> = { STRIPE: 'Stripe', PAYPAL: 'PayPal', TWOCHECKOUT: '2Checkout' };

@Injectable()
export class StorefrontSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async general(): Promise<Record<string, unknown>> {
    const row = await this.prisma.setting.findUnique({ where: { key: GENERAL_SETTINGS_KEY } });
    return (row?.value as Record<string, unknown>) ?? {};
  }

  // Footer content is admin-managed; `gateways` lists the payment gateways currently enabled under
  // Settings > Integrations, so the storefront's "accepted methods" follow the real configuration.
  async footer() {
    const [row, integrations] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: FOOTER_SETTINGS_KEY } }),
      this.prisma.setting.findMany({ where: { key: { in: paymentProviders.map(settingKeyFor) } }, select: { key: true, value: true } }),
    ]);
    const config = normaliseFooter(row?.value);
    const enabledKeys = new Set(integrations.filter((item) => (item.value as { enabled?: boolean } | null)?.enabled ?? true).map((item) => item.key));
    const gateways = paymentProviders.filter((provider) => enabledKeys.has(settingKeyFor(provider))).map((provider) => GATEWAY_LABELS[provider]);
    return { ...config, gateways };
  }
}
