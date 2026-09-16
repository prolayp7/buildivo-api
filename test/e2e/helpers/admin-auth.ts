import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

export async function loginAsSuperAdmin(app: INestApplication): Promise<string> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'superadmin@ukshop.test';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const res = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/login')
    .send({ email, password })
    .expect(200);

  return res.body.data.accessToken as string;
}
