import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin Gift Cards (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let token: string; let giftCardId: number;
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); token = await loginAsSuperAdmin(app); });
  afterAll(async () => {
    if (giftCardId) { await prisma.giftCardTransaction.deleteMany({ where: { giftCardId } }); await prisma.giftCard.delete({ where: { id: giftCardId } }).catch(() => undefined); }
    await app.close();
  });
  it('issues a card with a ledger entry and adjusts its balance', async () => {
    const issued = await request(app.getHttpServer()).post('/api/v1/admin/gift-cards')
      .set('Authorization', `Bearer ${token}`).send({ initialBalance: 100, issuedToEmail: 'gift@example.com' }).expect(201);
    giftCardId = issued.body.data.giftCard.id;
    expect(issued.body.data.transaction.type).toBe('ISSUE');

    const adjusted = await request(app.getHttpServer()).patch(`/api/v1/admin/gift-cards/${giftCardId}`)
      .set('Authorization', `Bearer ${token}`).send({ adjustment: -25 }).expect(200);
    expect(Number(adjusted.body.data.giftCard.currentBalance)).toBe(75);
    expect(adjusted.body.data.transaction.type).toBe('ADJUSTMENT');

    await request(app.getHttpServer()).patch(`/api/v1/admin/gift-cards/${giftCardId}`)
      .set('Authorization', `Bearer ${token}`).send({ adjustment: -76 }).expect(400);
  });
});
