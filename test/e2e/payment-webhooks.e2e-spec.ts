import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createHmac } from 'crypto';
import { createTestApp, registerAndVerify } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';

function signStripePayload(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

// Fakes the one Stripe endpoint this integration actually calls - creating a
// PaymentIntent - same jest.spyOn(global, 'fetch') pattern as the PayPal e2e
// spec's mockPaypalApi(), so the real controller/service/DB wiring for
// StripeGatewayService.createPaymentIntent is exercised end to end.
function mockStripeApi() {
  let seq = 0;
  return jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://api.stripe.com/v1/payment_intents') {
      seq += 1;
      const id = `pi_test_${Date.now()}_${seq}`;
      return new Response(JSON.stringify({ id, client_secret: `${id}_secret_test` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch to ${url} in test`);
  });
}

async function postStripeWebhook(app: INestApplication, payload: string, signatureHeader?: string) {
  const req = request(app.getHttpServer()).post('/api/v1/payments/webhooks/stripe').set('Content-Type', 'application/json');
  if (signatureHeader) req.set('Stripe-Signature', signatureHeader);
  return req.send(payload);
}

describe('Stripe webhook - not configured (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    let prisma: PrismaService;
    ({ app, prisma } = await createTestApp());
    // the test DB persists across runs (no truncation in global setup), so an
    // earlier run of this file's "configured" suite may have left this saved
    await prisma.setting.deleteMany({ where: { key: 'integration.payment.stripe' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 503 when no Stripe integration/webhook secret has been saved', async () => {
    const payload = JSON.stringify({ id: 'evt_unconfigured', type: 'payment_intent.succeeded', data: { object: { id: 'pi_unconfigured' } } });
    const res = await postStripeWebhook(app, payload, signStripePayload('whatever', payload));
    expect(res.status).toBe(503);
  });

  it('rejects a request with no Stripe-Signature header', async () => {
    const res = await postStripeWebhook(app, '{}');
    expect(res.status).toBe(400);
  });
});

describe('Stripe webhook - configured (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const webhookSecret = 'whsec_test_secret_for_e2e';
  let orderId: number;
  let orderUuidValue: string;
  let attemptProviderObjectId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    mockStripeApi();

    const adminToken = await loginAsSuperAdmin(app);
    const unlockRes = await request(app.getHttpServer())
      .post('/api/v1/admin/settings/integrations/unlock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scope: 'payment.stripe', password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!' })
      .expect(201);
    const unlockToken = unlockRes.body.data.token;

    await request(app.getHttpServer())
      .put('/api/v1/admin/settings/integrations/payment.stripe')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-settings-unlock', unlockToken)
      .send({ mode: 'SANDBOX', enabled: true, settings: { webhookSecret, publishableKey: 'pk_test_x', secretKey: 'sk_test_x' } })
      .expect(200);

    // Build a real order + payment attempt through the actual storefront flow -
    // StripeGatewayService.createPaymentIntent runs for real against the
    // mocked fetch above, so providerObjectId comes back already set.
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });

    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });
    const email = `webhook-${Date.now()}@example.com`;
    const auth = await registerAndVerify(app, { email, password: 'SuperSecret123!', firstName: 'Web', lastName: 'Hook' });
    const customerToken = auth.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: { fullName: 'Web Hook', line1: '1 Webhook Way', city: 'Bristol', postcode: 'BS1 1AA' },
        shippingMethodId: method!.id,
      })
      .expect(201);
    orderUuidValue = orderRes.body.data.uuid;

    const attemptRes = await request(app.getHttpServer())
      .post('/api/v1/payments/attempts')
      .set('Idempotency-Key', `webhook-test-${Date.now()}`)
      .send({ orderUuid: orderUuidValue, email, provider: 'STRIPE' })
      .expect(201);

    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { uuid: attemptRes.body.data.attemptId } });
    attemptProviderObjectId = attempt.providerObjectId!;
    orderId = attempt.orderId;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('rejects a payload with an invalid signature', async () => {
    const payload = JSON.stringify({ id: 'evt_bad_sig', type: 'payment_intent.succeeded', data: { object: { id: attemptProviderObjectId } } });
    const res = await postStripeWebhook(app, payload, 't=123,v1=deadbeef');
    expect(res.status).toBe(400);
  });

  it('rejects a correctly-signed but stale (replayed-window) timestamp', async () => {
    const payload = JSON.stringify({ id: 'evt_stale', type: 'payment_intent.succeeded', data: { object: { id: attemptProviderObjectId } } });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const res = await postStripeWebhook(app, payload, signStripePayload(webhookSecret, payload, staleTimestamp));
    expect(res.status).toBe(400);
  });

  it('captures the payment and transitions the order on payment_intent.succeeded', async () => {
    const payload = JSON.stringify({
      id: `evt_success_${Date.now()}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: attemptProviderObjectId } },
    });
    const res = await postStripeWebhook(app, payload, signStripePayload(webhookSecret, payload));
    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe('PAID');
    expect(order.status).toBe('PROCESSING');

    const attempt = await prisma.paymentAttempt.findFirst({ where: { providerObjectId: attemptProviderObjectId } });
    expect(attempt!.status).toBe('CAPTURED');

    const transaction = await prisma.paymentTransaction.findFirst({ where: { orderId } });
    expect(transaction).not.toBeNull();
    expect(transaction!.status).toBe('CAPTURED');

    const log = await prisma.paymentWebhookLog.findUnique({ where: { providerEventId: JSON.parse(payload).id } });
    expect(log?.processedAt).not.toBeNull();

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
    expect(history[0].toStatus).toBe('PROCESSING');
  });

  it('is idempotent: replaying the same event id does not double-process', async () => {
    const eventId = `evt_replay_${Date.now()}`;
    const payload = JSON.stringify({ id: eventId, type: 'payment_intent.succeeded', data: { object: { id: attemptProviderObjectId } } });
    const signature = signStripePayload(webhookSecret, payload);

    const first = await postStripeWebhook(app, payload, signature);
    expect(first.status).toBe(200);
    const transactionsAfterFirst = await prisma.paymentTransaction.count({ where: { orderId } });

    const second = await postStripeWebhook(app, payload, signature);
    expect(second.status).toBe(200);
    const transactionsAfterSecond = await prisma.paymentTransaction.count({ where: { orderId } });

    // order already PAID by the earlier success test, so applyEvent's guard
    // short-circuits regardless - this proves the replay didn't error or duplicate
    expect(transactionsAfterSecond).toBe(transactionsAfterFirst);
  });

  it('transitions the order to FAILED on payment_intent.payment_failed', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });
    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

    const email = `webhook-fail-${Date.now()}@example.com`;
    const auth = await registerAndVerify(app, { email, password: 'SuperSecret123!', firstName: 'Fail', lastName: 'Case' });
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ shippingAddress: { fullName: 'Fail Case', line1: '2 Fail St', city: 'York', postcode: 'YO1 1AA' }, shippingMethodId: method!.id })
      .expect(201);

    const attemptRes = await request(app.getHttpServer())
      .post('/api/v1/payments/attempts')
      .set('Idempotency-Key', `webhook-fail-test-${Date.now()}`)
      .send({ orderUuid: orderRes.body.data.uuid, email, provider: 'STRIPE' })
      .expect(201);
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { uuid: attemptRes.body.data.attemptId } });
    const failProviderObjectId = attempt.providerObjectId!;

    const payload = JSON.stringify({ id: `evt_failed_${Date.now()}`, type: 'payment_intent.payment_failed', data: { object: { id: failProviderObjectId } } });
    const res = await postStripeWebhook(app, payload, signStripePayload(webhookSecret, payload));
    expect(res.status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: attempt.orderId } });
    expect(order.paymentStatus).toBe('FAILED');
    expect(order.status).toBe('FAILED');
  });
});
