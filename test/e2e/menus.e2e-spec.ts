import { INestApplication } from '@nestjs/common'; import * as request from 'supertest'; import { PrismaService } from '../../src/prisma/prisma.service'; import { loginAsSuperAdmin } from './helpers/admin-auth'; import { createTestApp } from './setup';
describe('Admin Menus (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let token: string; let menuId: number; let itemId: number; const suffix = Date.now();
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); token = await loginAsSuperAdmin(app); });
  afterAll(async () => { if (menuId) await prisma.menu.delete({ where: { id: menuId } }).catch(() => undefined); await app.close(); });
  it('creates a menu and nested item', async () => {
    const menu = await request(app.getHttpServer()).post('/api/v1/admin/menus').set('Authorization', `Bearer ${token}`).send({ name: 'Test Header', slug: `test-header-${suffix}`, location: 'HEADER' }).expect(201); menuId = menu.body.data.id;
    const item = await request(app.getHttpServer()).post(`/api/v1/admin/menus/${menuId}/items`).set('Authorization', `Bearer ${token}`).send({ label: 'Computers', href: '/computers', sortOrder: 1 }).expect(201); itemId = item.body.data.id;
  });
  it('creates and replaces a mega-menu panel atomically', async () => {
    const panel = await request(app.getHttpServer()).post(`/api/v1/admin/menus/items/${itemId}/mega-menu-panel`).set('Authorization', `Bearer ${token}`).send({ columns: [{ title: 'Shop', links: [{ label: 'All PCs', href: '/computers' }] }] }).expect(201);
    expect(panel.body.data.columns[0].links[0].label).toBe('All PCs');
    const replaced = await request(app.getHttpServer()).post(`/api/v1/admin/menus/items/${itemId}/mega-menu-panel`).set('Authorization', `Bearer ${token}`).send({ columns: [{ title: 'Explore', links: [{ label: 'Gaming PCs', href: '/gaming' }] }] }).expect(201);
    expect(replaced.body.data.columns).toHaveLength(1); expect(replaced.body.data.columns[0].links[0].label).toBe('Gaming PCs');
  });
});
