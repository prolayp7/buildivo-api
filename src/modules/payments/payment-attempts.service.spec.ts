import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentAttemptsService } from './payment-attempts.service';

describe('PaymentAttemptsService', () => {
  const dto = { orderUuid: '846fcbd1-e7fc-4d6f-bde2-cadbc24355d5', email: 'buyer@example.com', provider: 'STRIPE' as const };

  it('rejects an unconfigured provider before creating an attempt', async () => {
    const prisma = { setting: { findUnique: jest.fn().mockResolvedValue(null) } };
    // create() only reaches PaymentStateService/PaypalGatewayService/StripeGatewayService
    // once an attempt is actually created - it fails before that here, so
    // undefined stand-ins are never touched.
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never);

    await expect(service.create(dto, 'checkout-session-0001')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({ where: { key: 'integration.payment.stripe' }, select: { value: true } });
  });

  it('rejects a configured but disabled provider', async () => {
    const prisma = { setting: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: false } }) } };
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never);

    await expect(service.create(dto, 'checkout-session-0001')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses the server-side order total, records initial history, and creates the Stripe payment intent', async () => {
    const total = new Prisma.Decimal('149.95');
    const attempt = {
      id: 91,
      uuid: 'a339dc4e-a2ec-4313-832f-97185679860b',
      order_id: 12,
      provider: 'STRIPE' as const,
      status: 'CREATED',
      amount: total,
      currency: 'GBP',
      provider_object_id: null,
      redirect_url: null,
      client_secret: null,
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
      paymentAttempt: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const stripeGateway = {
      credentials: jest.fn().mockResolvedValue({ mode: 'SANDBOX', secretKey: 'sk_test_123' }),
      createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_123', clientSecret: 'pi_123_secret_abc' }),
    };
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, stripeGateway as never);

    const result = await service.create(dto, 'checkout-session-0001');

    expect(result).toMatchObject({ attemptId: attempt.uuid, amount: total, currency: 'GBP', status: 'CREATED', clientSecret: 'pi_123_secret_abc' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(stripeGateway.createPaymentIntent).toHaveBeenCalledWith(
      { mode: 'SANDBOX', secretKey: 'sk_test_123' },
      { amount: '149.95', currency: 'GBP', referenceId: attempt.uuid },
    );
    expect(prisma.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: attempt.id },
      data: { providerObjectId: 'pi_123', clientSecret: 'pi_123_secret_abc' },
    });
  });
});
