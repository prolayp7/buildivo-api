import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createReturn, inspectReturn } from './helpers/returns';
import { RefundSettlementService } from '../../src/modules/returns/refund-settlement.service';
import { registerAndVerify as registerCustomer } from './setup';
import { PaymentReconciliationService } from '../../src/modules/payments/payment-reconciliation.service';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Payment integrity: invoices, reconciliation, provider refunds, audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let variantId: number;
  let methodId: number;

  // Places a real order and a Stripe attempt (Stripe's session-create call faked); returns ids.
  const orderWithStripeAttempt = async () => {
    const email = `integrity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const { accessToken } = await registerCustomer(app, { email, password: 'SuperSecret123!', firstName: 'In', lastName: 'Teg' });
    await request(app.getHttpServer()).post('/api/v1/cart/items').set('Authorization', `Bearer ${accessToken}`).send({ productVariantId: variantId, quantity: 1 }).expect(201);
    const order = (await request(app.getHttpServer()).post('/api/v1/orders').set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: { fullName: 'In Teg', line1: '1 St', city: 'Bristol', postcode: 'BS1 1AA' }, shippingMethodId: methodId }).expect(201)).body.data;
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(json({ id: 'cs_test_x', url: 'https://checkout.stripe.com/x' }));
    const res = await request(app.getHttpServer()).post('/api/v1/payments/attempts').set('Idempotency-Key', `integrity-${Date.now()}-${Math.random()}`)
      .send({ orderUuid: order.uuid, email, provider: 'STRIPE' }).expect(201);
    spy.mockRestore();
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { uuid: res.body.data.attemptId } });
    const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { providerObjectId: sessionId, createdAt: new Date(Date.now() - 30 * 60_000) } });
    return { order, attempt, sessionId, accessToken };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    adminToken = await loginAsSuperAdmin(app);
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    variantId = detail.body.data.variants[0].id;
    methodId = (await prisma.shippingMethod.findFirstOrThrow({ where: { status: 'ACTIVE' } })).id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 500 } });
    const unlock = await request(app.getHttpServer()).post('/api/v1/admin/settings/integrations/unlock').set('Authorization', `Bearer ${adminToken}`)
      .send({ scope: 'payment.stripe', password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!' }).expect(201);
    await request(app.getHttpServer()).put('/api/v1/admin/settings/integrations/payment.stripe').set('Authorization', `Bearer ${adminToken}`)
      .set('x-settings-unlock', unlock.body.data.token).send({ mode: 'SANDBOX', enabled: true, settings: { webhookSecret: 'whsec_x', publishableKey: 'pk_test_x', secretKey: 'sk_test_x' } }).expect(200);
  });
  afterAll(async () => { await app.close(); });
  afterEach(() => jest.restoreAllMocks());

  it('reconciliation settles a paid Stripe session whose webhook never arrived, issuing a numbered invoice and audit entry', async () => {
    const { order, attempt, sessionId } = await orderWithStripeAttempt();
    const amount = Math.round(Number(attempt.amount) * 100);
    jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes(sessionId)
        ? json({ payment_status: 'paid', payment_intent: `pi_${sessionId}`, amount_total: amount, currency: attempt.currency.toLowerCase() })
        : json({ payment_status: 'unpaid', amount_total: 0, currency: 'gbp' }));

    expect(await app.get(PaymentReconciliationService).sweep()).toBeGreaterThanOrEqual(1);

    const paid = await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid }, include: { invoice: true } });
    expect(paid.paymentStatus).toBe('PAID');
    expect(paid.invoice?.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(await prisma.auditLog.count({ where: { action: 'payment.reconciled', entityId: String(attempt.id) } })).toBe(1);
  });

  it('a paid session with the wrong amount is not treated as paid', async () => {
    const { order, attempt, sessionId } = await orderWithStripeAttempt();
    jest.spyOn(global, 'fetch').mockImplementation(async (input) =>
      String(input).includes(sessionId) ? json({ payment_status: 'paid', payment_intent: 'pi_x', amount_total: 1, currency: attempt.currency.toLowerCase() }) : json({ payment_status: 'unpaid' }));
    await app.get(PaymentReconciliationService).sweep();
    expect((await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid } })).paymentStatus).not.toBe('PAID');
    expect(await prisma.auditLog.count({ where: { action: 'payment.amount_mismatch', entityId: String(attempt.id) } })).toBe(1);
  });

  const paidOrderWithReturn = async (provider: 'STRIPE') => {
    const { order } = await orderWithStripeAttempt();
    const row = await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid }, include: { items: true } });
    await prisma.paymentTransaction.create({ data: { orderId: row.id, provider, providerTransactionId: `pi_refund_${row.id}`, amount: row.total, currency: 'GBP', status: 'CAPTURED' } });
    const ret = await createReturn(prisma, row.id);
    await inspectReturn(app, adminToken, ret);
    return { row, ret };
  };

  it('a refund is sent to Stripe with an idempotency key and recorded with the provider refund id', async () => {
    const { row, ret } = await paidOrderWithReturn('STRIPE');
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(json({ id: 're_test_1', status: 'succeeded' }));
    const res = await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/refund`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    const refund = await prisma.paymentRefund.findFirstOrThrow({ where: { returnRequestId: ret.returnId } });
    const call = spy.mock.calls.find(([url]) => String(url) === 'https://api.stripe.com/v1/refunds')!;
    expect((call[1]!.headers as Record<string, string>)['idempotency-key']).toBe(`refund-${refund.id}`);
    expect(String(call[1]!.body)).toContain(`payment_intent=pi_refund_${row.id}`);
    expect(refund.providerRefundId).toBe('re_test_1');
    expect(refund.status).toBe('PROCESSED');
    expect(res.body.data.status).toBe('COMPLETED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus).toMatch(/REFUNDED/);
    expect(await prisma.auditLog.count({ where: { action: 'refund.processed', entityId: String(refund.id), actorType: 'ADMIN' } })).toBe(1);
  });

  it('a refund the provider reports as pending stays processing until the webhook confirms it', async () => {
    const { ret } = await paidOrderWithReturn('STRIPE');
    jest.spyOn(global, 'fetch').mockResolvedValue(json({ id: 're_pending_1', status: 'pending' }));
    const res = await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/refund`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    expect(res.body.data.status).toBe('REFUND_PROCESSING');
    const refund = await prisma.paymentRefund.findFirstOrThrow({ where: { returnRequestId: ret.returnId } });
    expect(refund.status).toBe('PROCESSING');
    await app.get(RefundSettlementService).settle(refund.id, 'PROCESSED', { actor: { type: 'SYSTEM' } });
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: ret.returnId } })).status).toBe('COMPLETED');
  });

  it('when the provider rejects the refund nothing is marked refunded', async () => {
    const { row, ret } = await paidOrderWithReturn('STRIPE');
    jest.spyOn(global, 'fetch').mockResolvedValue(json({ error: { message: 'nope' } }, 400));
    await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/refund`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    // Back to "refund approved" with the failure recorded, so the admin can retry.
    expect((await prisma.returnRequest.findUniqueOrThrow({ where: { id: ret.returnId } })).status).toBe('REFUND_APPROVED');
    expect((await prisma.paymentRefund.findFirstOrThrow({ where: { orderId: row.id } })).status).toBe('FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus).not.toMatch(/REFUNDED/);
    jest.spyOn(global, 'fetch').mockResolvedValue(json({ id: 're_retry_1', status: 'succeeded' }));
    const retried = await request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}/refund/retry`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    expect(retried.body.data.status).toBe('COMPLETED');
    expect(await prisma.paymentRefund.count({ where: { returnRequestId: ret.returnId, status: 'PROCESSED', attempt: 2 } })).toBe(1);
  });

  it('every response carries an X-Request-Id, and an incoming one is honoured', async () => {
    const generated = await request(app.getHttpServer()).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
    const echoed = await request(app.getHttpServer()).get('/api/v1/health').set('X-Request-Id', 'trace-abc-12345');
    expect(echoed.headers['x-request-id']).toBe('trace-abc-12345');
  });

  it('admins can read and filter the audit log', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/audit-logs?entity=PaymentRefund&action=refund.').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((row: { entity: string }) => row.entity === 'PaymentRefund')).toBe(true);
    await request(app.getHttpServer()).get('/api/v1/admin/audit-logs').expect(401);
  });

  it('a sweep is skipped while another instance holds the lease', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    let locked!: () => void;
    const gotLock = new Promise<void>((r) => { locked = r; });
    const holder = prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(727302)`; locked(); await held; });
    await gotLock;
    try {
      expect(await app.get(PaymentReconciliationService).sweep()).toBe(0);
    } finally { release(); await holder; }
  });

  it('admin can refund an order directly: partial, then the rest, and never more than was paid', async () => {
    const { order } = await orderWithStripeAttempt();
    const row = await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid } });
    await prisma.paymentTransaction.create({ data: { orderId: row.id, provider: 'STRIPE', providerTransactionId: `pi_order_refund_${row.id}`, amount: row.total, currency: 'GBP', status: 'CAPTURED' } });
    await prisma.order.update({ where: { id: row.id }, data: { paymentStatus: 'PAID' } });
    jest.spyOn(global, 'fetch').mockImplementation(async () => json({ id: 're_order_1', status: 'succeeded' })); // fresh Response per call
    const total = Number(row.total);
    const refund = (amount: number) => request(app.getHttpServer()).post(`/api/v1/admin/orders/${row.id}/refund`).set('Authorization', `Bearer ${adminToken}`).send({ amount, reason: 'Goodwill' });

    await refund(1).expect(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus).toBe('PARTIALLY_REFUNDED');
    await refund(total).expect(400); // 1 + total exceeds what was captured
    await refund(Math.round((total - 1) * 100) / 100).expect(201);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus).toBe('REFUNDED');
    const detail = await request(app.getHttpServer()).get(`/api/v1/admin/orders/${row.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(detail.body.data.paymentRefunds.filter((r: { status: string }) => r.status === 'PROCESSED')).toHaveLength(2);
  });
});
