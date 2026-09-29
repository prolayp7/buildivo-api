import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReturnRequestStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { heldQuantity, itemEligibility, ItemEligibility, orderStatusAfterReturns, returnedQuantity, unitsRefund } from './return-rules';

type Db = PrismaService | Prisma.TransactionClient;
export type ReturnActor = { type: 'CUSTOMER' | 'ADMIN' | 'SYSTEM'; id?: number };

const returnItemQuantities = { quantity: true, approvedQuantity: true, receivedQuantity: true, acceptedQuantity: true, inspectionResult: true, returnRequest: { select: { status: true } } } as const;

export type OrderItemReturnState = ItemEligibility & {
  orderItemId: number;
  title: string;
  variant: string;
  sku: string | null;
  productId: number;
  unitRefund: number;
  returnDeadline: Date | null;
};

/** Shared by the customer and admin return flows: eligibility, numbering, timeline and order status. */
@Injectable()
export class ReturnsCoreService {
  constructor(private readonly prisma: PrismaService) {}

  /** Per-item return state of an order, computed from every return request already made against it. */
  async orderReturnState(orderId: number, db: Db = this.prisma, now = new Date()): Promise<OrderItemReturnState[]> {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { status: true, subtotal: true, discountTotal: true, shippingCharge: true, items: { orderBy: { id: 'asc' }, include: { returnItems: { select: returnItemQuantities } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const money = { subtotal: Number(order.subtotal), discountTotal: Number(order.discountTotal), shippingCharge: Number(order.shippingCharge) };
    return order.items.map((item) => {
      const held = item.returnItems.reduce((sum, returnItem) => sum + heldQuantity(returnItem, returnItem.returnRequest.status), 0);
      const lineMoney = { quantity: item.quantity, subtotal: Number(item.subtotal), discount: Number(item.discount) };
      return {
        orderItemId: item.id,
        title: item.titleSnapshot,
        variant: item.variantTitleSnapshot,
        sku: item.skuSnapshot,
        productId: item.productId,
        returnDeadline: item.returnDeadline,
        unitRefund: unitsRefund(lineMoney, money, 1),
        ...itemEligibility({ orderStatus: order.status, itemStatus: item.status, quantity: item.quantity, returnEligible: item.returnEligible, returnDeadline: item.returnDeadline, held, now }),
      };
    });
  }

  /** RET-10001, RET-10002 ... derived from the row id, so numbers are unique without a separate sequence. */
  async createNumbered(tx: Prisma.TransactionClient, data: Omit<Prisma.ReturnRequestUncheckedCreateInput, 'returnNumber'>) {
    const created = await tx.returnRequest.create({ data: { ...data, returnNumber: `TMP-${randomUUID()}` } });
    return tx.returnRequest.update({ where: { id: created.id }, data: { returnNumber: `RET-${10000 + created.id}` } });
  }

  addEvent(db: Db, returnRequestId: number, input: { status?: ReturnRequestStatus; action: string; note?: string | null; actor: ReturnActor }) {
    return db.returnEvent.create({ data: { returnRequestId, status: input.status, action: input.action, note: input.note ?? null, actorType: input.actor.type, actorId: input.actor.id ?? null } });
  }

  /** Moves a return to a new status and records it on the timeline, in one step. */
  async setStatus(db: Db, returnRequestId: number, status: ReturnRequestStatus, input: { action: string; note?: string | null; actor: ReturnActor; data?: Prisma.ReturnRequestUpdateInput }) {
    const updated = await db.returnRequest.update({ where: { id: returnRequestId }, data: { ...input.data, status } });
    await this.addEvent(db, returnRequestId, { status, action: input.action, note: input.note, actor: input.actor });
    return updated;
  }

  /** After a return completes, the order becomes PARTIALLY_RETURNED or RETURNED by returned units. */
  async settleOrderStatus(db: Db, orderId: number, actor: ReturnActor) {
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, items: { select: { quantity: true, returnItems: { select: returnItemQuantities } } } },
    });
    const next = orderStatusAfterReturns(order.status, order.items.map((item) => ({
      ordered: item.quantity,
      returned: item.returnItems.reduce((sum, returnItem) => sum + returnedQuantity(returnItem, returnItem.returnRequest.status), 0),
    })));
    if (next === order.status) return;
    await db.order.update({ where: { id: orderId }, data: { status: next } });
    await db.orderStatusHistory.create({ data: { orderId, fromStatus: order.status, toStatus: next, note: next === 'RETURNED' ? 'All items returned' : 'Some items returned', ...(actor.type === 'ADMIN' && actor.id ? { changedByAdminId: actor.id } : {}) } });
  }
}
