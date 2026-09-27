import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

const KEY = 'register.page';

describe('Storefront register-page settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let original: unknown;

  const page = async () => (await request(app.getHttpServer()).get('/api/v1/settings/register-page').expect(200)).body.data;
  const save = (value: unknown) => request(app.getHttpServer()).put(`/api/v1/admin/settings/${KEY}`).set('Authorization', `Bearer ${admin}`).send({ value }).expect(200);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await loginAsSuperAdmin(app);
    original = (await prisma.setting.findUnique({ where: { key: KEY } }))?.value;
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: KEY } });
    if (original !== undefined) await prisma.setting.create({ data: { key: KEY, value: original as object } });
    await app.close();
  });

  it('serves the built-in copy until an admin saves anything', async () => {
    await prisma.setting.deleteMany({ where: { key: KEY } });
    const data = await page();
    expect(data.incentive).toMatchObject({ enabled: true, badge: 'NEW ACCOUNT INCENTIVE', highlight: 'Claim 15% Off', offerEnabled: true });
    expect(data.spotlight).toMatchObject({ enabled: true, title: 'Trending Jobsite Essentials' });
    expect(data.trust.enabled).toBe(true);
    expect(data.trust.items).toHaveLength(4);
    expect(data.trust.items.some((item: { kind: string }) => item.kind === 'freeDelivery')).toBe(true);
  });

  it('requires an admin to change it', async () => {
    await request(app.getHttpServer()).put(`/api/v1/admin/settings/${KEY}`).send({ value: {} }).expect(401);
  });

  it('serves what an admin saves, keeping fields that were left out at their defaults', async () => {
    await save({ incentive: { highlight: 'Save 10%', headingRest: 'On Your First Order.' }, spotlight: { title: 'Popular right now' } });
    const data = await page();
    expect(data.incentive).toMatchObject({ highlight: 'Save 10%', headingRest: 'On Your First Order.', badge: 'NEW ACCOUNT INCENTIVE', enabled: true });
    expect(data.spotlight).toMatchObject({ title: 'Popular right now', description: 'Explore popular tools and jobsite essentials for your first order' });
    expect(data.trust.items).toHaveLength(4);
  });

  it('lets each section be switched off independently', async () => {
    await save({ incentive: { enabled: false }, spotlight: { enabled: false }, trust: { enabled: false } });
    const off = await page();
    expect([off.incentive.enabled, off.spotlight.enabled, off.trust.enabled]).toEqual([false, false, false]);
    await save({ incentive: { enabled: true }, spotlight: { enabled: false }, trust: { enabled: true } });
    const mixed = await page();
    expect([mixed.incentive.enabled, mixed.spotlight.enabled, mixed.trust.enabled]).toEqual([true, false, true]);
  });

  it('respects an intentionally empty trust list', async () => {
    await save({ trust: { enabled: true, items: [] } });
    expect((await page()).trust.items).toEqual([]);
  });

  it('cleans up malformed entries and clamps lengths', async () => {
    await save({
      incentive: { badge: 'x'.repeat(500), enabled: 'yes', offerEnabled: false },
      trust: { items: [{ icon: 'Bad Icon!', kind: 'text', text: 'Kept, icon falls back' }, { icon: 'lock', kind: 'text', text: '   ' }, 'not-an-object', { icon: 'truck', kind: 'freeDelivery', text: 'ignored' }] },
    });
    const data = await page();
    expect(data.incentive.badge).toHaveLength(60);
    expect(data.incentive.enabled).toBe(true); // a non-boolean falls back to the default
    expect(data.incentive.offerEnabled).toBe(false);
    expect(data.trust.items).toEqual([
      { icon: 'verified', kind: 'text', text: 'Kept, icon falls back' },
      { icon: 'truck', kind: 'freeDelivery', text: '' },
    ]);
  });
});
