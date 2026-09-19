import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentAttemptsService } from './payment-attempts.service';

describe('PaymentAttemptsService', () => {
  const dto = { orderUuid: '846fcbd1-e7fc-4d6f-bde2-cadbc24355d5', email: 'buyer@example.com', provider: 'TWOCHECKOUT' as const };

  it('rejects an unconfigured provider before creating an attempt', async () => {
    const prisma = { setting: { findUnique: jest.fn().mockResolvedValue(null) } };
    // create() only reaches PaymentStateService/PaypalGatewayService for a
    // PAYPAL attempt (ensureProviderOrder short-circuits otherwise) - this
    // suite only exercises a gateway-less provider, so undefined stand-ins are never touched.
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never);

    await expect(service.create(dto, 'checkout-session-0001')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({ where: { key: 'integration.payment.2checkout' }, select: { value: true } });
  });

  it('rejects a configured but disabled provider', async () => {
    const prisma = { setting: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: false } }) } };
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never);

    await expect(service.create(dto, 'checkout-session-0001')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses the server-side order total and records initial history', async () => {
    const total = new Prisma.Decimal('149.95');
    const attempt = {
      id: 91,
      uuid: 'a339dc4e-a2ec-4313-832f-97185679860b',
      order_id: 12,
      provider: 'TWOCHECKOUT' as const,
      status: 'CREATED',
      amount: total,
      currency: 'GBP',
      redirect_url: null,
      failure_code: null,
      failure_message: null,
      retryable: false,
      expires_at: null,
    };
    const rootQuery = jest.fn()
      .mockResolvedValueOnce([{ id: 12, uuid: dto.orderUuid, total, payment_status: 'PENDING', status: 'AWAITING_PAYMENT' }])
      .mockResolvedValueOnce([]);
    const tx = { $queryRaw: jest.fn().mockResolvedValue([attempt]), $executeRaw: jest.fn().mockResolvedValue(1) };
    const prisma = {
      setting: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: true } }) },
      $queryRaw: rootQuery,
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    // create() only reaches PaymentStateService/PaypalGatewayService for a
    // PAYPAL attempt (ensureProviderOrder short-circuits otherwise) - this
    // suite only exercises a gateway-less provider, so undefined stand-ins are never touched.
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never);

    const result = await service.create(dto, 'checkout-session-0001');

    expect(result).toMatchObject({ attemptId: attempt.uuid, amount: total, currency: 'GBP', status: 'CREATED' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
