import { PrismaService } from '../../src/prisma/prisma.service';

describe('Gift Cards', () => {
  const prisma = new PrismaService();
  let userId: number;
  let orderId: number;
  let giftCardId: number;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: 'test-giftcard-user@example.com', passwordHash: 'x', firstName: 'Gift', lastName: 'Tester' },
    });
    userId = user.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: 'TESTGC00001',
        email: 'test-giftcard-user@example.com',
        billingFullName: 'Gift Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Gift Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        subtotal: 25,
        total: 15,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    if (giftCardId) {
      await prisma.giftCardTransaction.deleteMany({ where: { giftCardId } });
      await prisma.giftCard.delete({ where: { id: giftCardId } });
    }
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('issues a gift card and redeems part of its balance against an order', async () => {
    const giftCard = await prisma.giftCard.create({
      data: {
        code: 'TESTGIFT100',
        initialBalance: 25,
        currentBalance: 25,
        purchasedByUserId: userId,
        transactions: { create: { amount: 25, type: 'ISSUE' } },
      },
      include: { transactions: true },
    });
    giftCardId = giftCard.id;
    expect(giftCard.transactions).toHaveLength(1);

    await prisma.giftCardTransaction.create({
      data: { giftCardId, orderId, amount: -10, type: 'REDEEM' },
    });
    await prisma.giftCard.update({ where: { id: giftCardId }, data: { currentBalance: 15 } });

    const updated = await prisma.giftCard.findUniqueOrThrow({
      where: { id: giftCardId },
      include: { transactions: true },
    });
    expect(updated.currentBalance.toString()).toBe('15');
    expect(updated.transactions).toHaveLength(2);
  });

  it('rejects a duplicate gift card code (unique constraint)', async () => {
    await expect(
      prisma.giftCard.create({ data: { code: 'TESTGIFT100', initialBalance: 5, currentBalance: 5 } }),
    ).rejects.toThrow();
  });
});
