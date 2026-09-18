import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

// register() no longer logs the customer in directly - it just sends the
// verification code. Tests that only need an authenticated customer (not
// testing registration itself) go through both steps here to get a token.
export async function registerAndVerify(
  app: INestApplication,
  data: { email: string; password: string; firstName: string; lastName: string; phone?: string },
): Promise<{ accessToken: string; refreshToken: string; customer: { id: number; uuid: string; email: string; firstName: string; lastName: string } }> {
  const registerRes = await request(app.getHttpServer()).post('/api/v1/auth/register').send(data).expect(201);
  const verifyRes = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ email: data.email, purpose: 'email_verification', code: registerRes.body.data.otp })
    .expect(200);
  return verifyRes.body.data;
}
