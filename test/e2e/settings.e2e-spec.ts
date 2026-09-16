import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin Settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const key = `test.setting.${Date.now()}`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
  });

  afterAll(async () => {
    await prisma.setting.delete({ where: { key } }).catch(() => undefined);
    await app.close();
  });

  it('upserts and lists a JSON setting', async () => {
    const upserted = await request(app.getHttpServer())
      .put(`/api/v1/admin/settings/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: { enabled: true, limit: 5 } })
      .expect(200);
    expect(upserted.body.data.value).toEqual({ enabled: true, limit: 5 });

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.data.some((setting: { key: string }) => setting.key === key)).toBe(true);
  });
});
