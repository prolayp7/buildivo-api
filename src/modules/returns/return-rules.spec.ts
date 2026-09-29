import { heldQuantity, itemEligibility, itemRefund, lineNetPaid, orderStatusAfterReturns, unitsRefund } from './return-rules';

const blank = { approvedQuantity: null, receivedQuantity: null, acceptedQuantity: null, inspectionResult: null };

describe('return rules', () => {
  it('holds the quantity from the most advanced stage, and nothing for rejected/cancelled requests', () => {
    expect(heldQuantity({ ...blank, quantity: 3 }, 'RETURN_REQUESTED')).toBe(3);
    expect(heldQuantity({ ...blank, quantity: 3, approvedQuantity: 2 }, 'RETURN_APPROVED')).toBe(2);
    expect(heldQuantity({ ...blank, quantity: 3, approvedQuantity: 2, receivedQuantity: 1 }, 'RETURN_RECEIVED')).toBe(1);
    expect(heldQuantity({ ...blank, quantity: 3, approvedQuantity: 2, receivedQuantity: 2, acceptedQuantity: 1, inspectionResult: 'PARTIALLY_ACCEPTED' }, 'INSPECTION')).toBe(1);
    expect(heldQuantity({ ...blank, quantity: 3, acceptedQuantity: 0, inspectionResult: 'REJECTED' }, 'COMPLETED')).toBe(0);
    expect(heldQuantity({ ...blank, quantity: 3 }, 'RETURN_REJECTED')).toBe(0);
    expect(heldQuantity({ ...blank, quantity: 3 }, 'CANCELLED')).toBe(0);
  });

  it('refunds the price actually paid, sharing an order coupon across lines', () => {
    const order = { subtotal: 300, discountTotal: 30, shippingCharge: 5 };
    const line = { quantity: 2, subtotal: 200, discount: 0 };
    expect(lineNetPaid(line, order)).toBe(180); // 200 - 20 (two-thirds of the £30 coupon)
    expect(unitsRefund(line, order, 1)).toBe(90);
    expect(unitsRefund(line, order, 5)).toBe(180); // never more than the line
    expect(itemRefund(line, order, 1, 15)).toBe(75);
    expect(itemRefund(line, order, 1, 500)).toBe(0);
    expect(unitsRefund(line, { ...order, discountTotal: 0 }, 1)).toBe(100);
  });

  it('works out returnable quantity and the reason when nothing can be returned', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const base = { orderStatus: 'DELIVERED' as const, itemStatus: 'DELIVERED', quantity: 5, returnEligible: true, returnDeadline: new Date('2026-09-29'), held: 2, now };
    expect(itemEligibility(base)).toEqual({ ordered: 5, delivered: 5, previouslyReturned: 2, returnable: 3, eligible: true, reason: null });
    expect(itemEligibility({ ...base, returnDeadline: new Date('2026-09-28') }).eligible).toBe(false);
    expect(itemEligibility({ ...base, orderStatus: 'SHIPPED' }).returnable).toBe(0);
    expect(itemEligibility({ ...base, held: 5 }).reason).toMatch(/already been returned/);
    expect(itemEligibility({ ...base, returnEligible: false }).reason).toMatch(/cannot be returned/);
  });

  it('moves the order to partially returned / returned only by returned units', () => {
    expect(orderStatusAfterReturns('DELIVERED', [{ ordered: 2, returned: 0 }])).toBe('DELIVERED');
    expect(orderStatusAfterReturns('DELIVERED', [{ ordered: 2, returned: 1 }, { ordered: 1, returned: 0 }])).toBe('PARTIALLY_RETURNED');
    expect(orderStatusAfterReturns('PARTIALLY_RETURNED', [{ ordered: 2, returned: 2 }, { ordered: 1, returned: 1 }])).toBe('RETURNED');
  });
});
