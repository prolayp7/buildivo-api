import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';

describe('Storefront Addresses (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());

    const email = `address-customer-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Alex', lastName: 'Smith' })
      .expect(201);
    accessToken = res.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/addresses').expect(401);
  });

  it('creates, lists, updates, and deletes an address, managing a single default', async () => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

    const first = await auth(request(app.getHttpServer()).post('/api/v1/addresses'))
      .send({
        fullName: 'Alex Smith',
        line1: '1 High Street',
        city: 'London',
        postcode: 'SW1A 1AA',
        isDefault: true,
      })
      .expect(201);
    expect(first.body.data.isDefault).toBe(true);

    const second = await auth(request(app.getHttpServer()).post('/api/v1/addresses'))
      .send({
        fullName: 'Alex Smith',
        line1: '2 Market Road',
        city: 'Manchester',
        postcode: 'M1 1AE',
        isDefault: true,
      })
      .expect(201);
    expect(second.body.data.isDefault).toBe(true);

    const list = await auth(request(app.getHttpServer()).get('/api/v1/addresses')).expect(200);
    expect(list.body.data).toHaveLength(2);
    const firstAfter = list.body.data.find((a: { id: number }) => a.id === first.body.data.id);
    expect(firstAfter.isDefault).toBe(false); // superseded by the second default

    const updated = await auth(request(app.getHttpServer()).patch(`/api/v1/addresses/${first.body.data.id}`))
      .send({ city: 'Birmingham' })
      .expect(200);
    expect(updated.body.data.city).toBe('Birmingham');

    await auth(request(app.getHttpServer()).delete(`/api/v1/addresses/${first.body.data.id}`)).expect(204);
    await auth(request(app.getHttpServer()).get(`/api/v1/addresses/${first.body.data.id}`)).expect(404);
  });
});
