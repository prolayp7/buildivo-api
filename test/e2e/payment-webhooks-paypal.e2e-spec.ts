import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';

const PAYPAL_BASE = 'https://api-m.sandbox.paypal.com';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Fakes just the PayPal endpoints this integration actually calls -
 * OAuth token, create order, capture order, verify webhook signature -
 * same jest.spyOn(global, 'fetch') pattern as CarrierGatewaysService's and
 * PaypalGatewayService's own specs, applied here at the HTTP-request level
 * so the real controller/service/DB wiring is exercised end to end. */
function mockPaypalApi(options: { captureStatus?: string; verifyStatus?: 'SUCCESS' | 'FAILURE' } = {}) {
  const captureStatus = options.captureStatus ?? 'COMPLETED';
  const verifyStatus = options.verifyStatus ?? 'SUCCESS';
  let captureSeq = 0;

  return jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === `${PAYPAL_BASE}/v1/oauth2/token`) {
      return jsonResponse({ access_token: 'sandbox-access-token', expires_in: 32400 });
    }
    if (url === `${PAYPAL_BASE}/v2/checkout/orders`) {
      const id = `PAYPAL-ORDER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return jsonResponse({
        id,
        links: [
          { rel: 'self', href: `${PAYPAL_BASE}/v2/checkout/orders/${id}` },
          { rel: 'approve', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` },
        ],
      });
    }
    const captureMatch = url.match(/\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (captureMatch) {
      captureSeq += 1;
      return jsonResponse({
        status: captureStatus,
        purchase_units: [{ payments: { captures: [{ id: `CAPTURE-${captureMatch[1]}-${captureSeq}` }] } }],
      });
    }
    if (url === `${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`) {
      return jsonResponse({ verification_status: verifyStatus });
    }
    throw new Error(`Unexpected fetch to ${url} in test`);
  });
}

function paypalWebhookHeaders() {
  return {
    'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
    'PAYPAL-CERT-URL': 'https://api.sandbox.paypal.com/cert',
    'PAYPAL-TRANSMISSION-ID': `tx-${Date.now()}`,
    'PAYPAL-TRANSMISSION-SIG': 'fake-signature-verified-by-mocked-fetch',
    'PAYPAL-TRANSMISSION-TIME': new Date().toISOString(),
  };
}

async function createOrderAndPaypalAttempt(app: INestApplication, prisma: PrismaService, emailPrefix: string) {
  const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
  const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
  const variantId = detail.body.data.variants[0].id;
  await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });
  const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

  const email = `${emailPrefix}-${Date.now()}@example.com`;
  const registerRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password: 'SuperSecret123!', firstName: 'PayPal', lastName: 'Case' })
    .expect(201);
  const token = registerRes.body.data.accessToken;

  await request(app.getHttpServer())
    .post('/api/v1/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ productVariantId: variantId, quantity: 1 })
    .expect(201);

  const orderRes = await request(app.getHttpServer())
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ shippingAddress: { fullName: 'PayPal Case', line1: '1 PayPal Way', city: 'Leeds', postcode: 'LS1 1AA' }, shippingMethodId: method!.id })
    .expect(201);
  const orderUuid = orderRes.body.data.uuid;

  const attemptRes = await request(app.getHttpServer())
    .post('/api/v1/payments/attempts')
    .set('Idempotency-Key', `paypal-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    .send({ orderUuid, email, provider: 'PAYPAL' })
    .expect(201);

  return { email, orderUuid, orderId: (await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } })).id, attempt: attemptRes.body.data };
}

describe('PayPal payments - not configured (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await prisma.setting.deleteMany({ where: { key: 'integration.payment.paypal' } });
  });
  afterAll(async () => app.close());
  afterEach(() => jest.restoreAllMocks());

  it('rejects creating a PayPal payment attempt when unconfigured', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    void list;
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/attempts')
      .set('Idempotency-Key', `paypal-unconfigured-${Date.now()}`)
      .send({ orderUuid: '00000000-0000-0000-0000-000000000000', email: 'nobody@example.com', provider: 'PAYPAL' });
    expect(res.status).toBe(503);
  });

  it('returns 503 for a PayPal webhook when unconfigured', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/paypal')
      .set(paypalWebhookHeaders())
      .send({ id: 'evt-unconfigured', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} });
    expect(res.status).toBe(503);
  });
});

describe('PayPal payments - configured (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    const adminToken = await loginAsSuperAdmin(app);
    const unlockRes = await request(app.getHttpServer())
      .post('/api/v1/admin/settings/integrations/unlock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scope: 'payment.paypal', password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!' })
      .expect(201);
    const unlockToken = unlockRes.body.data.token;

    await request(app.getHttpServer())
      .put('/api/v1/admin/settings/integrations/payment.paypal')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-settings-unlock', unlockToken)
      .send({ mode: 'SANDBOX', enabled: true, settings: { clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', webhookId: 'WH-TEST-1' } })
      .expect(200);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.restoreAllMocks());

  it('creates a real PayPal order and stores the approval link', async () => {
    mockPaypalApi();
    const { attempt } = await createOrderAndPaypalAttempt(app, prisma, 'paypal-create');

    expect(attempt.provider).toBe('PAYPAL');
    expect(attempt.status).toBe('CREATED');
    expect(attempt.redirectUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\/checkoutnow\?token=/);
  });

  it('reuses the same PayPal order on an idempotent retry instead of creating a second one', async () => {
    const fetchMock = mockPaypalApi();
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });
    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });
    const email = `paypal-retry-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Retry', lastName: 'Case' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${registerRes.body.data.accessToken}`)
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${registerRes.body.data.accessToken}`)
      .send({ shippingAddress: { fullName: 'Retry Case', line1: '1 Retry Rd', city: 'Hull', postcode: 'HU1 1AA' }, shippingMethodId: method!.id })
      .expect(201);
    const idempotencyKey = `paypal-retry-${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post('/api/v1/payments/attempts')
      .set('Idempotency-Key', idempotencyKey)
      .send({ orderUuid: orderRes.body.data.uuid, email, provider: 'PAYPAL' })
      .expect(201);
    const createCallsAfterFirst = fetchMock.mock.calls.filter((call) => String(call[0]) === `${PAYPAL_BASE}/v2/checkout/orders`).length;

    const second = await request(app.getHttpServer())
      .post('/api/v1/payments/attempts')
      .set('Idempotency-Key', idempotencyKey)
      .send({ orderUuid: orderRes.body.data.uuid, email, provider: 'PAYPAL' })
      .expect(201);
    const createCallsAfterSecond = fetchMock.mock.calls.filter((call) => String(call[0]) === `${PAYPAL_BASE}/v2/checkout/orders`).length;

    expect(second.body.data.redirectUrl).toBe(first.body.data.redirectUrl);
    expect(createCallsAfterSecond).toBe(createCallsAfterFirst);
  });

  it('captures the payment directly and transitions the order', async () => {
    mockPaypalApi({ captureStatus: 'COMPLETED' });
    const { email, orderId, attempt } = await createOrderAndPaypalAttempt(app, prisma, 'paypal-capture');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/attempts/${attempt.attemptId}/capture`)
      .send({ email });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('CAPTURED');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe('PAID');
    expect(order.status).toBe('PROCESSING');

    const transaction = await prisma.paymentTransaction.findFirst({ where: { orderId } });
    expect(transaction).not.toBeNull();
    expect(transaction!.status).toBe('CAPTURED');
    expect(transaction!.provider).toBe('PAYPAL');
  });

  it('is idempotent: capturing an already-captured attempt again does not call PayPal or duplicate the transaction', async () => {
    const fetchMock = mockPaypalApi({ captureStatus: 'COMPLETED' });
    const { email, orderId, attempt } = await createOrderAndPaypalAttempt(app, prisma, 'paypal-capture-twice');

    await request(app.getHttpServer()).post(`/api/v1/payments/attempts/${attempt.attemptId}/capture`).send({ email }).expect(201);
    const transactionsAfterFirst = await prisma.paymentTransaction.count({ where: { orderId } });
    fetchMock.mockClear();

    const second = await request(app.getHttpServer()).post(`/api/v1/payments/attempts/${attempt.attemptId}/capture`).send({ email });
    expect(second.status).toBe(201);
    expect(second.body.data.status).toBe('CAPTURED');
    const transactionsAfterSecond = await prisma.paymentTransaction.count({ where: { orderId } });

    expect(transactionsAfterSecond).toBe(transactionsAfterFirst);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transitions the order to FAILED when PayPal declines the capture', async () => {
    mockPaypalApi({ captureStatus: 'DECLINED' });
    const { email, orderId, attempt } = await createOrderAndPaypalAttempt(app, prisma, 'paypal-decline');

    const res = await request(app.getHttpServer()).post(`/api/v1/payments/attempts/${attempt.attemptId}/capture`).send({ email });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FAILED');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe('FAILED');
    expect(order.status).toBe('FAILED');
  });

  it('drives the order to PAID from the webhook alone, without the capture endpoint ever being called', async () => {
    mockPaypalApi();
    const { orderId, attempt } = await createOrderAndPaypalAttempt(app, prisma, 'paypal-webhook-only');
    const paypalOrderId = attempt.redirectUrl.split('token=')[1];

    const payload = {
      id: `evt-${Date.now()}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: `CAPTURE-${paypalOrderId}`, supplementary_data: { related_ids: { order_id: paypalOrderId } } },
    };
    const res = await request(app.getHttpServer()).post('/api/v1/payments/webhooks/paypal').set(paypalWebhookHeaders()).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe('PAID');
    expect(order.status).toBe('PROCESSING');

    const log = await prisma.paymentWebhookLog.findUnique({ where: { providerEventId: payload.id } });
    expect(log?.processedAt).not.toBeNull();
  });

  it('is idempotent: a webhook replay after the capture endpoint already ran does not duplicate the transaction', async () => {
    mockPaypalApi();
    const { email, orderId, attempt } = await createOrderAndPaypalAttempt(app, prisma, 'paypal-webhook-replay');
    const paypalOrderId = attempt.redirectUrl.split('token=')[1];

    await request(app.getHttpServer()).post(`/api/v1/payments/attempts/${attempt.attemptId}/capture`).send({ email }).expect(201);
    const transactionsAfterCapture = await prisma.paymentTransaction.count({ where: { orderId } });

    const payload = {
      id: `evt-replay-${Date.now()}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: `CAPTURE-${paypalOrderId}-webhook`, supplementary_data: { related_ids: { order_id: paypalOrderId } } },
    };
    const res = await request(app.getHttpServer()).post('/api/v1/payments/webhooks/paypal').set(paypalWebhookHeaders()).send(payload);
    expect(res.status).toBe(200);

    const transactionsAfterWebhook = await prisma.paymentTransaction.count({ where: { orderId } });
    expect(transactionsAfterWebhook).toBe(transactionsAfterCapture);
  });

  it('rejects a webhook whose signature PayPal reports as invalid', async () => {
    mockPaypalApi({ verifyStatus: 'FAILURE' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/paypal')
      .set(paypalWebhookHeaders())
      .send({ id: 'evt-bad-sig', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} });
    expect(res.status).toBe(400);
  });

  it('rejects a webhook missing PayPal transmission headers', async () => {
    mockPaypalApi();
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/paypal')
      .send({ id: 'evt-no-headers', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} });
    expect(res.status).toBe(400);
  });
});
