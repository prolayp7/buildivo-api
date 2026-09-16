import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';

describe('Storefront Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const email = `customer-${Date.now()}@example.com`;
  const password = 'SuperSecret123!';

  it('registers a new customer and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Jane', lastName: 'Doe' })
      .expect(201);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.customer.email).toBe(email);
    expect(res.body.data.otp).toMatch(/^\d{6}$/);
  });

  it('rejects a duplicate registration', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Jane', lastName: 'Doe' })
      .expect(409);
  });

  it('rejects invalid login credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logs in, verifies email via OTP, fetches /me, updates profile, refreshes, and logs out', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken, refreshToken } = loginRes.body.data;

    const otpRes = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/send')
      .send({ email, purpose: 'email_verification' })
      .expect(200);
    const otp = otpRes.body.data.otp;
    expect(otp).toMatch(/^\d{6}$/);

    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ email, purpose: 'email_verification', code: otp })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ email, purpose: 'email_verification', code: otp })
      .expect(400); // already consumed

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meRes.body.data.email).toBe(email);
    expect(meRes.body.data.emailVerified).toBe(true);

    const updateRes = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Janet' })
      .expect(200);
    expect(updateRes.body.data.firstName).toBe('Janet');

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);

    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: refreshRes.body.data.refreshToken })
      .expect(204);
  });

  it('rejects /me without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
  });

  it('resets a forgotten password via OTP', async () => {
    const otpRes = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/send')
      .send({ email, purpose: 'password_reset' })
      .expect(200);
    const otp = otpRes.body.data.otp;

    const newPassword = 'BrandNewPass456!';
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .send({ email, code: otp, newPassword })
      .expect(200);

    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: newPassword }).expect(200);
  });
});
