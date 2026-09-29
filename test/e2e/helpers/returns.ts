import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service';

/** A customer return of one whole order line, created directly (the storefront flow has its own tests). */
export async function createReturn(prisma: PrismaService, orderId: number) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const item = order.items[0];
  const created = await prisma.returnRequest.create({
    data: {
      returnNumber: `RET-T${orderId}-${Date.now()}`, orderId, userId: order.userId!,
      pickupFullName: order.shippingFullName, pickupLine1: order.shippingLine1, pickupCity: order.shippingCity, pickupPostcode: order.shippingPostcode,
      items: { create: { orderItemId: item.id, quantity: item.quantity, reason: 'CHANGED_MIND' } },
    },
    include: { items: true },
  });
  return { returnId: created.id, returnItemId: created.items[0].id, quantity: item.quantity, orderItem: item };
}

/** Drives a return through approve -> pickup -> picked up -> received -> inspection (accepted), ready for refund. */
export async function inspectReturn(app: INestApplication, adminToken: string, ret: { returnId: number; returnItemId: number; quantity: number }) {
  const post = (path: string, body: object = {}) =>
    request(app.getHttpServer()).post(`/api/v1/admin/returns/${ret.returnId}${path}`).set('Authorization', `Bearer ${adminToken}`).send(body).expect(201);
  await post('/approve', { items: [{ returnItemId: ret.returnItemId, quantity: ret.quantity }] });
  await post('/pickup', { courier: 'Evri', pickupDate: '2026-10-01', pickupWindow: '9am-1pm', trackingNumber: 'RT123' });
  await post('/picked-up');
  await post('/receive', { items: [{ returnItemId: ret.returnItemId, quantity: ret.quantity }] });
  await post('/inspection');
  await post(`/items/${ret.returnItemId}/inspection`, { condition: 'NEW', accessoriesPresent: true, result: 'ACCEPTED' });
}
