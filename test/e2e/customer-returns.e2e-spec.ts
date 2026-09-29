import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { registerAndVerify as registerCustomer } from './setup';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

// Order-item-level returns (docs: ecom refund flow): partial quantities, several requests per order,
// per-item reasons and private evidence photos, server-side validation, and the admin flow to a refund.
describe('Customer returns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let token: string;
  let otherToken: string;
  let orderUuid: string;
  let orderId: number;
  let orderItemId: number;
  let photo: Buffer;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    adminToken = await loginAsSuperAdmin(app);
    photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c33' } }).png().toBuffer();

    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });
    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

    ({ accessToken: token } = await registerCustomer(app, { email: `returns-${Date.now()}@example.com`, password: 'SuperSecret123!', firstName: 'Ret', lastName: 'Urner' }));
    ({ accessToken: otherToken } = await registerCustomer(app, { email: `returns-other-${Date.now()}@example.com`, password: 'SuperSecret123!', firstName: 'Other', lastName: 'Person' }));
    await request(app.getHttpServer()).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({ productVariantId: variantId, quantity: 3 }).expect(201);
    const orderRes = await request(app.getHttpServer()).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: { fullName: 'Ret Urner', line1: '1 Return Road', city: 'Leeds', postcode: 'LS1 1AA' }, shippingMethodId: method!.id }).expect(201);
    orderUuid = orderRes.body.data.uuid;
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid }, include: { items: true } });
    orderId = order.id;
    orderItemId = order.items[0].id;
    // Delivered, paid (offline provider: refunds are recorded locally), 30-day window open.
    await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED', paymentStatus: 'PAID' } });
    await prisma.orderItem.update({ where: { id: orderItemId }, data: { status: 'DELIVERED', returnDeadline: new Date(Date.now() + 20 * 86400000) } });
    await prisma.paymentTransaction.create({ data: { orderId, provider: 'MANUAL', providerTransactionId: `ret_${orderUuid}`, amount: order.total, status: 'CAPTURED' } });
  });

  afterAll(async () => { await app.close(); });

  const submit = (items: object[], photos: Buffer[] = [], auth = token) => {
    const req = request(app.getHttpServer()).post('/api/v1/returns').set('Authorization', `Bearer ${auth}`).field('data', JSON.stringify({ orderUuid, items }));
    photos.forEach((buffer, i) => req.attach('evidence_0', buffer, `photo-${i}.png`));
    return req;
  };
  const returnable = async () => (await request(app.getHttpServer()).get(`/api/v1/returns/orders/${orderUuid}`).set('Authorization', `Bearer ${token}`).expect(200)).body.data.items[0];

  let firstReturn: { returnNumber: string; imageId: number };

  it('shows each item with ordered, returnable quantity and eligibility', async () => {
    expect(await returnable()).toMatchObject({ orderItemId, ordered: 3, delivered: 3, previouslyReturned: 0, returnable: 3, eligible: true });
    await request(app.getHttpServer()).get(`/api/v1/returns/orders/${orderUuid}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
  });

  it('creates a return for part of the quantity, with a reason and an evidence photo', async () => {
    const res = await submit([{ orderItemId, quantity: 2, reason: 'DAMAGED', description: 'Cracked case' }], [photo]).expect(201);
    expect(res.body.data).toMatchObject({ status: 'RETURN_REQUESTED', returnNumber: expect.stringMatching(/^RET-\d+$/) });
    expect(res.body.data.items[0]).toMatchObject({ quantity: 2, reason: 'DAMAGED', description: 'Cracked case', refundIsFinal: false });
    expect(res.body.data.items[0].imageIds).toHaveLength(1);
    expect(res.body.data.estimatedRefund).toBeGreaterThan(0);
    firstReturn = { returnNumber: res.body.data.returnNumber, imageId: res.body.data.items[0].imageIds[0] };
    expect(await returnable()).toMatchObject({ previouslyReturned: 2, returnable: 1 });
  });

  it('serves evidence photos only to their owner, re-encoded', async () => {
    const own = await request(app.getHttpServer()).get(`/api/v1/returns/${firstReturn.returnNumber}/images/${firstReturn.imageId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(own.headers['content-type']).toMatch(/image\/webp/);
    expect(own.headers['cache-control']).toBe('private, no-store');
    await request(app.getHttpServer()).get(`/api/v1/returns/${firstReturn.returnNumber}/images/${firstReturn.imageId}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
  });

  it('validates quantities, reasons and photos server-side', async () => {
    await submit([{ orderItemId, quantity: 2, reason: 'DAMAGED' }]).expect(400); // only 1 left
    await submit([{ orderItemId, quantity: 1, reason: 'OTHER' }]).expect(400); // "Other" needs text
    await submit([{ orderItemId, quantity: 1, reason: 'DAMAGED' }], [Buffer.from('not an image')]).expect(400);
    await submit([{ orderItemId, quantity: 1, reason: 'DAMAGED' }], [], otherToken).expect(404);
  });

  it('allows another return for the remaining unit, which the customer can cancel while unreviewed', async () => {
    const second = await submit([{ orderItemId, quantity: 1, reason: 'CHANGED_MIND' }]).expect(201);
    expect(await returnable()).toMatchObject({ returnable: 0, eligible: false });
    const cancelled = await request(app.getHttpServer()).post(`/api/v1/returns/${second.body.data.returnNumber}/cancel`).set('Authorization', `Bearer ${token}`).expect(201);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(await returnable()).toMatchObject({ returnable: 1, eligible: true });
  });

  it('runs the admin flow to a refund and marks the order partially returned', async () => {
    const id = (await prisma.returnRequest.findUniqueOrThrow({ where: { returnNumber: firstReturn.returnNumber } })).id;
    const itemId = (await prisma.returnItem.findFirstOrThrow({ where: { returnRequestId: id } })).id;
    const post = (path: string, body: object = {}) => request(app.getHttpServer()).post(`/api/v1/admin/returns/${id}${path}`).set('Authorization', `Bearer ${adminToken}`).send(body);

    await post('/reject', { reason: 'no' }).expect(400); // a real reason is required
    await post('/approve', { items: [{ returnItemId: itemId, quantity: 3 }] }).expect(400); // more than requested
    await post('/approve', { items: [{ returnItemId: itemId, quantity: 2 }] }).expect(201);
    await post('/receive', { items: [{ returnItemId: itemId, quantity: 2 }] }).expect(409); // pickup first
    await post('/pickup', { courier: 'Evri', pickupDate: '2026-10-01', pickupWindow: '9am–1pm', trackingNumber: 'RT123456' }).expect(201);
    await post('/picked-up').expect(201);
    await post('/receive', { items: [{ returnItemId: itemId, quantity: 2 }] }).expect(201);
    await post('/inspection').expect(201);
    await post('/refund').expect(400); // inspect first
    await post(`/items/${itemId}/inspection`, { condition: 'DAMAGED', accessoriesPresent: false, result: 'PARTIALLY_ACCEPTED', acceptedQuantity: 1, deductionAmount: 1 }).expect(400); // deduction needs a reason
    const inspected = await post(`/items/${itemId}/inspection`, { condition: 'DAMAGED', accessoriesPresent: false, result: 'PARTIALLY_ACCEPTED', acceptedQuantity: 1, deductionAmount: 1, deductionReason: 'Missing cable' }).expect(201);
    const expected = inspected.body.data.calculation.total;
    expect(inspected.body.data.calculation.shipping).toBe(0); // not the whole order

    const done = await post('/refund').expect(201);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.refunds[0]).toMatchObject({ status: 'PROCESSED', amount: expected });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PARTIALLY_RETURNED');

    const mine = await request(app.getHttpServer()).get(`/api/v1/returns/${firstReturn.returnNumber}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(mine.body.data).toMatchObject({ status: 'COMPLETED', pickup: { courier: 'Evri', trackingNumber: 'RT123456' } });
    expect(mine.body.data.items[0]).toMatchObject({ acceptedQuantity: 1, refundIsFinal: true, deductionReason: 'Missing cable' });
    expect(mine.body.data.events.map((event: { status: string | null }) => event.status).filter(Boolean)).toEqual(
      ['RETURN_REQUESTED', 'RETURN_APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'RETURN_RECEIVED', 'INSPECTION', 'REFUND_APPROVED', 'REFUND_PROCESSING', 'COMPLETED']);
    // Only the accepted unit counts as returned: two remain returnable later.
    expect(await returnable()).toMatchObject({ previouslyReturned: 1, returnable: 2 });
  });
});
