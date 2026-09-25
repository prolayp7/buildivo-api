import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp, registerAndVerify } from './setup';

const api = (app: INestApplication) => request(app.getHttpServer());
const money = (value: unknown) => Number(value);
const round2 = (value: number) => Math.round(value * 100) / 100;

describe('Bulk pricing, bundles and Request-a-Quote (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let variants: { id: number; productId: number; price: number; stockQty: number }[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await loginAsSuperAdmin(app);
    const found = await prisma.productVariant.findMany({
      where: { deletedAt: null, status: 'ACTIVE', isDefault: true, stockQty: { gte: 50 }, salePrice: null, product: { deletedAt: null, status: 'ACTIVE' } },
      orderBy: { id: 'asc' },
      take: 4,
    });
    expect(found.length).toBeGreaterThanOrEqual(3);
    variants = found.map((v) => ({ id: v.id, productId: v.productId, price: money(v.price), stockQty: v.stockQty }));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('quantity-break (wholesale) pricing', () => {
    const tierPath = () => `/api/v1/admin/products/${variants[0].productId}/variants/${variants[0].id}/price-tiers`;
    const tierUnit = () => round2(variants[0].price * 0.8);

    beforeAll(async () => {
      await prisma.productPriceTier.deleteMany({ where: { productVariantId: variants[0].id } });
    });
    afterAll(async () => {
      await prisma.productPriceTier.deleteMany({ where: { productVariantId: variants[0].id } });
    });

    it('rejects a tier that starts below 2 units and requires admin auth', async () => {
      await api(app).post(tierPath()).set('Authorization', `Bearer ${admin}`).send({ minQty: 1, unitPrice: 5 }).expect(400);
      await api(app).post(tierPath()).send({ minQty: 5, unitPrice: 5 }).expect(401);
    });

    it('lets an admin create and list a tier', async () => {
      await api(app).post(tierPath()).set('Authorization', `Bearer ${admin}`).send({ minQty: 5, unitPrice: tierUnit() }).expect(201);
      const listed = await api(app).get(tierPath()).set('Authorization', `Bearer ${admin}`).expect(200);
      const tiers = listed.body.data as { minQty: number; unitPrice: string }[];
      expect(tiers).toHaveLength(1);
      expect(tiers[0].minQty).toBe(5);
      expect(money(tiers[0].unitPrice)).toBeCloseTo(tierUnit(), 2);
    });

    it('exposes the tier on the public product detail', async () => {
      const product = await prisma.product.findUniqueOrThrow({ where: { id: variants[0].productId } });
      const detail = await api(app).get(`/api/v1/products/${product.slug}`).expect(200);
      const variant = detail.body.data.variants.find((v: { id: number }) => v.id === variants[0].id);
      expect(variant.priceTiers).toHaveLength(1);
      expect(variant.priceTiers[0].minQty).toBe(5);
    });

    it('charges the regular price below the break and the tier price at the break', async () => {
      const below = await api(app).post('/api/v1/cart/items').send({ productVariantId: variants[0].id, quantity: 4 }).expect(201);
      expect(below.body.data.items[0].unitPrice).toBeCloseTo(variants[0].price, 2);
      expect(below.body.data.subtotal).toBeCloseTo(variants[0].price * 4, 2);

      const atBreak = await api(app).post('/api/v1/cart/items').send({ productVariantId: variants[0].id, quantity: 5 }).expect(201);
      expect(atBreak.body.data.items[0].unitPrice).toBeCloseTo(tierUnit(), 2);
      expect(atBreak.body.data.subtotal).toBeCloseTo(tierUnit() * 5, 2);
    });

    it('re-prices the line when the quantity crosses the break', async () => {
      const created = await api(app).post('/api/v1/cart/items').send({ productVariantId: variants[0].id, quantity: 2 }).expect(201);
      const guest = created.body.data.guestToken;
      expect(created.body.data.items[0].unitPrice).toBeCloseTo(variants[0].price, 2);

      const updated = await api(app).patch(`/api/v1/cart/items/${variants[0].id}`).set('x-guest-token', guest).send({ quantity: 6 }).expect(200);
      expect(updated.body.data.items[0].unitPrice).toBeCloseTo(tierUnit(), 2);
    });

    it('never charges more than the regular price when a tier is not cheaper', async () => {
      await prisma.productPriceTier.deleteMany({ where: { productVariantId: variants[0].id } });
      await api(app).post(tierPath()).set('Authorization', `Bearer ${admin}`).send({ minQty: 3, unitPrice: round2(variants[0].price * 1.5) }).expect(201);
      const res = await api(app).post('/api/v1/cart/items').send({ productVariantId: variants[0].id, quantity: 3 }).expect(201);
      expect(res.body.data.items[0].unitPrice).toBeCloseTo(variants[0].price, 2);
    });
  });

  describe('product bundles', () => {
    const slug = `e2e-bundle-${Date.now()}`;
    let bundleId: number;
    let bundlePrice: number;
    let regularTotal: number;

    beforeAll(() => {
      regularTotal = round2(variants[1].price * 2 + variants[2].price * 1);
      bundlePrice = round2(regularTotal * 0.85);
    });
    afterAll(async () => {
      await prisma.cartItem.deleteMany({ where: { bundleId } }).catch(() => undefined);
      if (bundleId) await prisma.productBundle.delete({ where: { id: bundleId } }).catch(() => undefined);
    });

    it('requires admin auth and at least one item to create a bundle', async () => {
      await api(app).post('/api/v1/admin/bundles').send({ title: 'x', slug: 'x', bundlePrice: 10, items: [{ productVariantId: variants[1].id }] }).expect(401);
      await api(app).post('/api/v1/admin/bundles').set('Authorization', `Bearer ${admin}`).send({ title: 'x', slug: 'x', bundlePrice: 10, items: [] }).expect(400);
    });

    it('creates an active bundle that the public list and detail expose with savings', async () => {
      const created = await api(app).post('/api/v1/admin/bundles').set('Authorization', `Bearer ${admin}`).send({
        title: 'E2E Job Kit', slug, description: 'Test bundle', bundlePrice, status: 'ACTIVE',
        items: [{ productVariantId: variants[1].id, quantity: 2 }, { productVariantId: variants[2].id, quantity: 1 }],
      }).expect(201);
      bundleId = created.body.data.id;

      const list = await api(app).get('/api/v1/bundles').expect(200);
      expect(list.body.data.some((b: { slug: string }) => b.slug === slug)).toBe(true);

      const detail = await api(app).get(`/api/v1/bundles/${slug}`).expect(200);
      expect(detail.body.data.items).toHaveLength(2);
      expect(detail.body.data.regularTotal).toBeCloseTo(regularTotal, 2);
      expect(detail.body.data.savings).toBeCloseTo(regularTotal - bundlePrice, 2);
    });

    it('returns 404 for unknown, inactive and expired bundles', async () => {
      await api(app).get('/api/v1/bundles/does-not-exist').expect(404);

      await api(app).patch(`/api/v1/admin/bundles/${bundleId}`).set('Authorization', `Bearer ${admin}`).send({ status: 'INACTIVE' }).expect(200);
      await api(app).get(`/api/v1/bundles/${slug}`).expect(404);

      await api(app).patch(`/api/v1/admin/bundles/${bundleId}`).set('Authorization', `Bearer ${admin}`).send({ status: 'ACTIVE', endsAt: new Date(Date.now() - 86_400_000).toISOString() }).expect(200);
      await api(app).get(`/api/v1/bundles/${slug}`).expect(404);

      await api(app).patch(`/api/v1/admin/bundles/${bundleId}`).set('Authorization', `Bearer ${admin}`).send({ endsAt: null }).expect(200);
      await api(app).get(`/api/v1/bundles/${slug}`).expect(200);
    });

    it('adds the whole bundle to a guest cart at the bundle price', async () => {
      const res = await api(app).post(`/api/v1/bundles/${slug}/add-to-cart`).expect(201);
      expect(res.body.data.guestToken).toBeTruthy();
      expect(res.body.data.items).toHaveLength(2);
      const quantities = Object.fromEntries(res.body.data.items.map((i: { productVariantId: number; quantity: number }) => [i.productVariantId, i.quantity]));
      expect(quantities[variants[1].id]).toBe(2);
      expect(quantities[variants[2].id]).toBe(1);
      expect(res.body.data.subtotal).toBeCloseTo(bundlePrice, 1);
    });

    it('refuses to add a bundle that needs more stock than is available', async () => {
      const big = `${slug}-big`;
      const created = await api(app).post('/api/v1/admin/bundles').set('Authorization', `Bearer ${admin}`).send({
        title: 'Too big', slug: big, bundlePrice: 50, items: [{ productVariantId: variants[1].id, quantity: variants[1].stockQty + 1 }],
      }).expect(201);
      try {
        await api(app).post(`/api/v1/bundles/${big}/add-to-cart`).expect(400);
      } finally {
        await prisma.productBundle.delete({ where: { id: created.body.data.id } });
      }
    });

    it('hides a soft-deleted bundle from the storefront', async () => {
      await api(app).delete(`/api/v1/admin/bundles/${bundleId}`).set('Authorization', `Bearer ${admin}`).expect(204);
      await api(app).get(`/api/v1/bundles/${slug}`).expect(404);
    });
  });

  describe('Request-a-Quote (RFQ)', () => {
    const stamp = Date.now();
    const quoteBody = (extra: Record<string, unknown> = {}) => ({
      contactName: 'Pat Builder', email: `rfq-${stamp}@example.com`, companyName: 'Builder & Sons',
      message: 'Need 40 units delivered next week', items: [{ productVariantId: variants[0].id, quantity: 40 }, { productVariantId: variants[1].id, quantity: 10 }],
      ...extra,
    });
    let customerA: { accessToken: string; customer: { id: number } };
    let customerB: { accessToken: string };
    let guestQuoteUuid: string;
    let ownQuote: { uuid: string; id: number; itemIds: number[] };

    beforeAll(async () => {
      customerA = await registerAndVerify(app, { email: `rfq-a-${stamp}@example.com`, password: 'SuperSecret123!', firstName: 'Ann', lastName: 'Quote' });
      customerB = await registerAndVerify(app, { email: `rfq-b-${stamp}@example.com`, password: 'SuperSecret123!', firstName: 'Bob', lastName: 'Other' });
    });
    afterAll(async () => {
      await prisma.quoteRequest.deleteMany({ where: { email: { contains: `${stamp}@example.com` } } });
    });

    it('lets a guest submit a quote request', async () => {
      const res = await api(app).post('/api/v1/quotes').send(quoteBody()).expect(201);
      guestQuoteUuid = res.body.data.uuid;
      expect(res.body.data.status).toBe('NEW');
      expect(res.body.data.userId).toBeNull();
      expect(res.body.data.items).toHaveLength(2);
    });

    it('validates the request body', async () => {
      await api(app).post('/api/v1/quotes').send(quoteBody({ items: [] })).expect(400);
      await api(app).post('/api/v1/quotes').send(quoteBody({ email: 'not-an-email' })).expect(400);
      await api(app).post('/api/v1/quotes').send(quoteBody({ contactName: '' })).expect(400);
      await api(app).post('/api/v1/quotes').send(quoteBody({ items: [{ productVariantId: variants[0].id, quantity: 0 }] })).expect(400);
      await api(app).post('/api/v1/quotes').send(quoteBody({ items: [{ productVariantId: 999_999_999, quantity: 1 }] })).expect(400);
    });

    it('links a signed-in customer\'s request to their account and lists only their own', async () => {
      const res = await api(app).post('/api/v1/quotes').set('Authorization', `Bearer ${customerA.accessToken}`).send(quoteBody({ email: `rfq-a-${stamp}@example.com` })).expect(201);
      ownQuote = { uuid: res.body.data.uuid, id: res.body.data.id, itemIds: res.body.data.items.map((i: { id: number }) => i.id) };
      expect(res.body.data.userId).toBe(customerA.customer.id);

      await api(app).get('/api/v1/quotes').expect(401);
      const mine = await api(app).get('/api/v1/quotes').set('Authorization', `Bearer ${customerA.accessToken}`).expect(200);
      const uuids = mine.body.data.map((q: { uuid: string }) => q.uuid);
      expect(uuids).toContain(ownQuote.uuid);
      expect(uuids).not.toContain(guestQuoteUuid);
    });

    it('hides one customer\'s quote from another customer', async () => {
      await api(app).get(`/api/v1/quotes/${ownQuote.uuid}`).set('Authorization', `Bearer ${customerB.accessToken}`).expect(404);
      await api(app).patch(`/api/v1/quotes/${ownQuote.uuid}/accept`).set('Authorization', `Bearer ${customerB.accessToken}`).expect(404);
    });

    it('cannot be accepted or declined before it has been priced', async () => {
      await api(app).patch(`/api/v1/quotes/${ownQuote.uuid}/accept`).set('Authorization', `Bearer ${customerA.accessToken}`).expect(400);
      await api(app).patch(`/api/v1/quotes/${ownQuote.uuid}/decline`).set('Authorization', `Bearer ${customerA.accessToken}`).expect(400);
    });

    it('requires admin auth to see and answer quotes', async () => {
      await api(app).get('/api/v1/admin/quotes').expect(401);
      await api(app).patch(`/api/v1/admin/quotes/${ownQuote.id}`).send({ status: 'QUOTED' }).expect(401);
    });

    it('lets an admin price the quote, and the customer sees the prices', async () => {
      const list = await api(app).get('/api/v1/admin/quotes?status=NEW&perPage=100').set('Authorization', `Bearer ${admin}`).expect(200);
      expect(list.body.data.some((q: { id: number }) => q.id === ownQuote.id)).toBe(true);

      const responded = await api(app).patch(`/api/v1/admin/quotes/${ownQuote.id}`).set('Authorization', `Bearer ${admin}`).send({
        status: 'QUOTED', quotedTotal: 640.5, adminNote: 'Volume discount applied',
        items: [{ id: ownQuote.itemIds[0], quotedUnitPrice: 12.5 }, { id: ownQuote.itemIds[1], quotedUnitPrice: 14 }],
      }).expect(200);
      expect(responded.body.data.status).toBe('QUOTED');
      expect(responded.body.data.respondedAt).toBeTruthy();

      const detail = await api(app).get(`/api/v1/quotes/${ownQuote.uuid}`).set('Authorization', `Bearer ${customerA.accessToken}`).expect(200);
      expect(money(detail.body.data.quotedTotal)).toBe(640.5);
      expect(detail.body.data.items.map((i: { quotedUnitPrice: string }) => money(i.quotedUnitPrice)).sort()).toEqual([12.5, 14]);
    });

    it('rejects pricing an item that belongs to a different quote', async () => {
      const other = await prisma.quoteRequest.findUniqueOrThrow({ where: { uuid: guestQuoteUuid }, include: { items: true } });
      await api(app).patch(`/api/v1/admin/quotes/${ownQuote.id}`).set('Authorization', `Bearer ${admin}`).send({ items: [{ id: other.items[0].id, quotedUnitPrice: 1 }] }).expect(400);
    });

    it('lets the customer accept a priced quote exactly once', async () => {
      const accepted = await api(app).patch(`/api/v1/quotes/${ownQuote.uuid}/accept`).set('Authorization', `Bearer ${customerA.accessToken}`).expect(200);
      expect(accepted.body.data.status).toBe('ACCEPTED');
      await api(app).patch(`/api/v1/quotes/${ownQuote.uuid}/accept`).set('Authorization', `Bearer ${customerA.accessToken}`).expect(400);
      await api(app).patch(`/api/v1/quotes/${ownQuote.uuid}/decline`).set('Authorization', `Bearer ${customerA.accessToken}`).expect(400);
    });

    it('lets the customer decline a priced quote', async () => {
      const res = await api(app).post('/api/v1/quotes').set('Authorization', `Bearer ${customerA.accessToken}`).send(quoteBody({ email: `rfq-a-${stamp}@example.com` })).expect(201);
      await api(app).patch(`/api/v1/admin/quotes/${res.body.data.id}`).set('Authorization', `Bearer ${admin}`).send({ status: 'QUOTED', quotedTotal: 100 }).expect(200);
      const declined = await api(app).patch(`/api/v1/quotes/${res.body.data.uuid}/decline`).set('Authorization', `Bearer ${customerA.accessToken}`).expect(200);
      expect(declined.body.data.status).toBe('DECLINED');
    });
  });
});
