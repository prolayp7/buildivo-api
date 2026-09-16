import { INestApplication } from '@nestjs/common'; import * as request from 'supertest'; import { PrismaService } from '../../src/prisma/prisma.service'; import { loginAsSuperAdmin } from './helpers/admin-auth'; import { createTestApp } from './setup';
describe('Admin Notifications and Reports (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let token: string; let notificationId: string;
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); token = await loginAsSuperAdmin(app); });
  afterAll(async () => { if (notificationId) await prisma.notification.delete({ where: { id: notificationId } }).catch(() => undefined); await app.close(); });
  it('creates a broadcast notification', async () => { const response = await request(app.getHttpServer()).post('/api/v1/admin/notifications').set('Authorization', `Bearer ${token}`).send({ type: 'ANNOUNCEMENT', title: 'Test notice', message: 'Scheduled maintenance', metadata: { test: true } }).expect(201); notificationId = response.body.data.id; expect(response.body.data.userId).toBeNull(); expect(response.body.data.adminUserId).toBeTruthy(); });
  it('returns all report shapes for a valid range', async () => { const range = 'dateFrom=2026-01-01T00:00:00.000Z&dateTo=2026-12-31T23:59:59.999Z'; const sales = await request(app.getHttpServer()).get(`/api/v1/admin/reports/sales?${range}&groupBy=month`).set('Authorization', `Bearer ${token}`).expect(200); expect(sales.body.data).toHaveProperty('points'); const orders = await request(app.getHttpServer()).get(`/api/v1/admin/reports/orders?${range}`).set('Authorization', `Bearer ${token}`).expect(200); expect(orders.body.data).toHaveProperty('byStatus'); });
  it('rejects an inverted report range', async () => { await request(app.getHttpServer()).get('/api/v1/admin/reports/sales?dateFrom=2026-12-31T00:00:00.000Z&dateTo=2026-01-01T00:00:00.000Z&groupBy=day').set('Authorization', `Bearer ${token}`).expect(400); });

  describe('drill-down reports (category/brand, coupons, geography)', () => {
    const range = 'dateFrom=2026-01-01T00:00:00.000Z&dateTo=2026-12-31T23:59:59.999Z';
    let categoryId: number;
    let couponCode: string;

    beforeAll(async () => {
      const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
      const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
      categoryId = detail.body.data.category.id;
      const variantId = detail.body.data.variants[0].id;
      await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });
      const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

      couponCode = `REPORTS-${Date.now()}`;
      await prisma.coupon.create({ data: { code: couponCode, name: 'Reports drill-down test', discountType: 'FIXED', discountAmount: 3, excludeSaleItems: false } });

      const email = `reports-drilldown-${Date.now()}@example.com`;
      const registerRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'SuperSecret123!', firstName: 'Report', lastName: 'Drilldown' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${registerRes.body.data.accessToken}`)
        .send({ productVariantId: variantId, quantity: 1 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${registerRes.body.data.accessToken}`)
        .send({
          shippingAddress: { fullName: 'Report Drilldown', line1: '1 Report Rd', city: 'Glasgow', postcode: 'G1 1AA' },
          shippingMethodId: method!.id,
          couponCode,
        })
        .expect(201);

      // these reports only count PAID/PARTIALLY_REFUNDED/REFUNDED orders, so
      // simulate a captured payment the same way the admin regression spec does
      const order = await prisma.order.findFirstOrThrow({ where: { email }, orderBy: { createdAt: 'desc' } });
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } });
    });

    it('breaks sales down by category and brand', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/reports/category-brand-sales?${range}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data).toHaveProperty('byCategory');
      expect(res.body.data).toHaveProperty('byBrand');
      expect(res.body.data.byCategory.some((row: { categoryId: number }) => row.categoryId === categoryId)).toBe(true);
    });

    it('reports coupon usage and discount totals', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/reports/coupons?${range}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const row = res.body.data.rows.find((r: { code: string }) => r.code === couponCode);
      expect(row).toBeDefined();
      expect(row.ordersCount).toBe(1);
      expect(row.totalDiscount).toBeCloseTo(3, 2);
    });

    it('breaks sales down by shipping postcode area', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/reports/geography?${range}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const row = res.body.data.rows.find((r: { postcodeArea: string }) => r.postcodeArea === 'G');
      expect(row).toBeDefined();
      expect(row.orderCount).toBeGreaterThanOrEqual(1);
    });
  });
});
