import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';

describe('CORS (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('reflects an allowed storefront origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products?perPage=1')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not reflect an origin outside the allowlist', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products?perPage=1')
      .set('Origin', 'https://evil.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  const originalLimit = process.env.THROTTLE_LIMIT;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '3';
    process.env.THROTTLE_TTL_MS = '60000';
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    if (originalLimit === undefined) delete process.env.THROTTLE_LIMIT;
    else process.env.THROTTLE_LIMIT = originalLimit;
  });

  it('returns 429 once a client exceeds the configured per-window limit', async () => {
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server).get('/api/v1/categories');
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});
