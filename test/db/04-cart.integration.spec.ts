import { PrismaService } from '../../src/prisma/prisma.service';

describe('Cart & Personalization', () => {
  const prisma = new PrismaService();
  let userId: number;
  let categoryId: number;
  let productId: number;
  let variantId: number;
  let cartId: number;
  let wishlistId: number;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: 'test-cart-user@example.com', passwordHash: 'x', firstName: 'Cart', lastName: 'Tester' },
    });
    userId = user.id;

    const category = await prisma.category.create({ data: { title: 'Test Cart Category', slug: 'test-cart-category' } });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Cart Product', slug: 'test-cart-product', status: 'ACTIVE' },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: { productId, title: 'Default', slug: 'test-cart-product-default', price: 19.99, stockQty: 5 },
    });
    variantId = variant.id;
  });

  afterAll(async () => {
    if (wishlistId) await prisma.wishlistItem.deleteMany({ where: { wishlistId } });
    if (wishlistId) await prisma.wishlist.delete({ where: { id: wishlistId } });
    if (cartId) await prisma.cartItem.deleteMany({ where: { cartId } });
    if (cartId) await prisma.cart.delete({ where: { id: cartId } });
    await prisma.browsingHistory.deleteMany({ where: { userId } });
    if (variantId) await prisma.productVariant.delete({ where: { id: variantId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('adds an item to a cart and a wishlist, and records browsing history', async () => {
    const cart = await prisma.cart.create({
      data: { userId, items: { create: { productVariantId: variantId, quantity: 2 } } },
      include: { items: true },
    });
    cartId = cart.id;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);

    const wishlist = await prisma.wishlist.create({
      data: { userId, slug: 'test-wishlist', items: { create: { productVariantId: variantId } } },
      include: { items: true },
    });
    wishlistId = wishlist.id;
    expect(wishlist.items).toHaveLength(1);

    await prisma.browsingHistory.create({ data: { userId, productId } });
    const history = await prisma.browsingHistory.findMany({ where: { userId } });
    expect(history).toHaveLength(1);
  });

  it('rejects adding the same variant to a cart twice (unique constraint)', async () => {
    await expect(
      prisma.cartItem.create({ data: { cartId, productVariantId: variantId, quantity: 1 } }),
    ).rejects.toThrow();
  });
});
