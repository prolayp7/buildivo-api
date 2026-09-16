import { PrismaService } from '../../src/prisma/prisma.service';

describe('Orders & Fulfillment', () => {
  const prisma = new PrismaService();
  let userId: number;
  let adminUserId: number;
  let roleId: number;
  let categoryId: number;
  let productId: number;
  let variantId: number;
  let shippingMethodId: number;
  let orderId: number;
  let orderItemId: number;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: 'test-orders-user@example.com', passwordHash: 'x', firstName: 'Order', lastName: 'Tester' },
    });
    userId = user.id;

    const role = await prisma.role.create({ data: { name: 'Test Orders Admin Role' } });
    roleId = role.id;
    const admin = await prisma.adminUser.create({
      data: { email: 'test-orders-admin@example.com', passwordHash: 'x', name: 'Order Admin', roleId },
    });
    adminUserId = admin.id;

    const category = await prisma.category.create({ data: { title: 'Test Orders Category', slug: 'test-orders-category' } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Orders Product', slug: 'test-orders-product', status: 'ACTIVE' },
    });
    productId = product.id;
    const variant = await prisma.productVariant.create({
      data: { productId, title: 'Default', slug: 'test-orders-product-default', price: 99.0, stockQty: 3 },
    });
    variantId = variant.id;

    const shippingMethod = await prisma.shippingMethod.create({
      data: {
        title: 'Test Royal Mail Tracked 48',
        carrier: 'Royal Mail',
        rateType: 'FLAT',
        flatRate: 4.99,
      },
    });
    shippingMethodId = shippingMethod.id;
  });

  afterAll(async () => {
    if (orderItemId) {
      await prisma.review.deleteMany({ where: { orderItemId } });
      await prisma.orderItemReturn.deleteMany({ where: { orderItemId } });
    }
    if (orderId) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
    if (shippingMethodId) await prisma.shippingMethod.delete({ where: { id: shippingMethodId } });
    if (variantId) await prisma.productVariant.delete({ where: { id: variantId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (adminUserId) await prisma.adminUser.delete({ where: { id: adminUserId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates an order with an item, status history, a return, and a review', async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        orderNumber: 'TESTORD00001',
        email: 'test-orders-user@example.com',
        billingFullName: 'Order Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Order Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        shippingMethodId,
        subtotal: 99.0,
        total: 103.99,
        items: {
          create: {
            productId,
            productVariantId: variantId,
            titleSnapshot: 'Test Orders Product',
            variantTitleSnapshot: 'Default',
            quantity: 1,
            unitPrice: 99.0,
            vatRatePercent: 20.0,
            vatAmount: 16.5,
            subtotal: 99.0,
          },
        },
        statusHistory: {
          create: { toStatus: 'PENDING', note: 'Order placed', changedByAdminId: adminUserId },
        },
      },
      include: { items: true, statusHistory: true },
    });
    orderId = order.id;
    orderItemId = order.items[0].id;

    expect(order.items).toHaveLength(1);
    expect(order.statusHistory).toHaveLength(1);

    const orderReturn = await prisma.orderItemReturn.create({
      data: { orderItemId, userId, reason: 'Changed my mind' },
    });
    expect(orderReturn.returnStatus).toBe('REQUESTED');

    const review = await prisma.review.create({
      data: { productId, orderItemId, orderId, userId, rating: 5, comment: 'Great product' },
    });
    expect(review.status).toBe('PENDING');
  });

  it('rejects a second review for the same order item (unique constraint)', async () => {
    await expect(
      prisma.review.create({ data: { productId, orderItemId, orderId, userId, rating: 4 } }),
    ).rejects.toThrow();
  });
});
