import type { OrderStatus, ReturnInspectionResult, ReturnRequestStatus } from '@prisma/client';

// Pure rules for order-item-level returns (docs: ecom refund flow). Everything that decides how many
// units can be returned, or how much money goes back, lives here so it is computed once, server-side,
// and unit-tested. Callers pass plain numbers (Prisma Decimals converted with Number()).

export const RETURN_WINDOW_DAYS = 30;
export const MAX_EVIDENCE_IMAGES_PER_ITEM = 5;
export const MAX_EVIDENCE_IMAGE_BYTES = 10 * 1024 * 1024;

/** Requests that no longer hold any units: they never happened, as far as quantities go. */
const RELEASED: ReturnRequestStatus[] = ['RETURN_REJECTED', 'CANCELLED'];
/** Orders whose goods have reached the customer. */
export const DELIVERED_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'PARTIALLY_RETURNED', 'RETURNED'];

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type ReturnItemQuantities = {
  quantity: number;
  approvedQuantity: number | null;
  receivedQuantity: number | null;
  acceptedQuantity: number | null;
  inspectionResult: ReturnInspectionResult | null;
};

/** Units of an order item that a return item holds, at the most advanced stage it has reached:
 * inspected -> accepted; received -> received; approved -> approved; otherwise the requested quantity. */
export function heldQuantity(item: ReturnItemQuantities, requestStatus: ReturnRequestStatus): number {
  if (RELEASED.includes(requestStatus)) return 0;
  if (item.inspectionResult) return item.acceptedQuantity ?? 0;
  if (item.receivedQuantity !== null) return item.receivedQuantity;
  if (item.approvedQuantity !== null) return item.approvedQuantity;
  return item.quantity;
}

/** Units of an order item that are definitively returned (accepted at inspection of a finished return). */
export function returnedQuantity(item: ReturnItemQuantities, requestStatus: ReturnRequestStatus): number {
  return requestStatus === 'COMPLETED' ? item.acceptedQuantity ?? 0 : 0;
}

export type OrderMoney = { subtotal: number; discountTotal: number; shippingCharge: number };
export type OrderItemMoney = { quantity: number; subtotal: number; discount: number };

/** What the customer actually paid for a whole order line: its VAT-inclusive subtotal, less any line
 * discount and its proportional share of an order-level coupon. */
export function lineNetPaid(item: OrderItemMoney, order: OrderMoney): number {
  const couponShare = order.subtotal > 0 ? (order.discountTotal * item.subtotal) / order.subtotal : 0;
  return Math.max(0, item.subtotal - item.discount - couponShare);
}

/** Refund for `units` units of a line: the price paid per unit. Never more than the line itself. */
export function unitsRefund(item: OrderItemMoney, order: OrderMoney, units: number): number {
  if (units <= 0 || item.quantity <= 0) return 0;
  return round2((lineNetPaid(item, order) * Math.min(units, item.quantity)) / item.quantity);
}

/** Final refund for an inspected return item: accepted units at the price paid, less any deduction. */
export function itemRefund(item: OrderItemMoney, order: OrderMoney, acceptedUnits: number, deduction: number): number {
  return round2(Math.max(0, unitsRefund(item, order, acceptedUnits) - Math.max(0, deduction)));
}

export type ItemEligibility = {
  ordered: number;
  delivered: number;
  previouslyReturned: number;
  returnable: number;
  eligible: boolean;
  reason: string | null;
};

/** Whether (and how much of) an order line the customer can still ask to return, as of `now`. */
export function itemEligibility(input: {
  orderStatus: OrderStatus;
  itemStatus: string;
  quantity: number;
  returnEligible: boolean;
  returnDeadline: Date | null;
  held: number;
  now: Date;
}): ItemEligibility {
  const delivered = DELIVERED_ORDER_STATUSES.includes(input.orderStatus) ? input.quantity : 0;
  const returnable = Math.max(0, delivered - input.held);
  const base = { ordered: input.quantity, delivered, previouslyReturned: input.held, returnable };
  const endOfDeadline = input.returnDeadline ? new Date(input.returnDeadline.getTime() + 24 * 60 * 60 * 1000 - 1) : null;
  const reason =
    input.itemStatus === 'CANCELLED' ? 'This item was cancelled.'
    : !delivered ? 'Returns open once the order has been delivered.'
    : !input.returnEligible ? 'This product cannot be returned.'
    : endOfDeadline && endOfDeadline < input.now ? 'The return window for this item has closed.'
    : returnable === 0 ? 'Every unit of this item has already been returned or is in a return.'
    : null;
  return { ...base, eligible: reason === null, reason };
}

/** Order status once returns have settled: every unit returned -> RETURNED, some -> PARTIALLY_RETURNED. */
export function orderStatusAfterReturns(current: OrderStatus, lines: { ordered: number; returned: number }[]): OrderStatus {
  const returned = lines.reduce((sum, line) => sum + Math.min(line.returned, line.ordered), 0);
  const ordered = lines.reduce((sum, line) => sum + line.ordered, 0);
  if (!returned) return current;
  return returned >= ordered ? 'RETURNED' : 'PARTIALLY_RETURNED';
}
