import { PrismaService } from '../../src/prisma/prisma.service';

describe('Marketing & Merchandising', () => {
  const prisma = new PrismaService();
  let categoryId: number;
  let productId: number;
  let orderId: number;
  let couponId: number;
  let bannerId: number;
  let featuredSectionId: number;
  let heroSlideId: number;
  let heroBadgeId: number;
  let menuId: number;

  beforeAll(async () => {
    const category = await prisma.category.create({ data: { title: 'Test Marketing Category', slug: 'test-marketing-category' } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Marketing Product', slug: 'test-marketing-product', status: 'ACTIVE' },
    });
    productId = product.id;
    const order = await prisma.order.create({
      data: {
        orderNumber: 'TESTMKT00001',
        email: 'test-marketing@example.com',
        billingFullName: 'Mkt Tester',
        billingLine1: '1 Test Street',
        billingCity: 'London',
        billingPostcode: 'SW1A 1AA',
        shippingFullName: 'Mkt Tester',
        shippingLine1: '1 Test Street',
        shippingCity: 'London',
        shippingPostcode: 'SW1A 1AA',
        subtotal: 20,
        total: 18,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    if (menuId) {
      const items = await prisma.menuItem.findMany({ where: { menuId } });
      for (const item of items) {
        const panel = await prisma.megaMenuPanel.findUnique({ where: { menuItemId: item.id } });
        if (panel) {
          const columns = await prisma.megaMenuColumn.findMany({ where: { panelId: panel.id } });
          for (const col of columns) {
            await prisma.megaMenuLink.deleteMany({ where: { columnId: col.id } });
          }
          await prisma.megaMenuColumn.deleteMany({ where: { panelId: panel.id } });
          await prisma.megaMenuPanel.delete({ where: { id: panel.id } });
        }
      }
      await prisma.menuItem.deleteMany({ where: { menuId } });
      await prisma.menu.delete({ where: { id: menuId } });
    }
    if (heroSlideId) await prisma.heroSlide.delete({ where: { id: heroSlideId } });
    if (heroBadgeId) await prisma.heroTrustBadge.delete({ where: { id: heroBadgeId } });
    if (featuredSectionId) {
      await prisma.featuredSectionProduct.deleteMany({ where: { featuredSectionId } });
      await prisma.featuredSection.delete({ where: { id: featuredSectionId } });
    }
    if (bannerId) await prisma.banner.delete({ where: { id: bannerId } });
    if (orderId) {
      await prisma.orderCouponLine.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
    if (couponId) await prisma.coupon.delete({ where: { id: couponId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('applies a coupon to an order exactly once', async () => {
    const coupon = await prisma.coupon.create({
      data: {
        code: 'TESTCOUPON10',
        name: 'Test coupon 10%',
        discountType: 'PERCENT',
        discountAmount: 10,
      },
    });
    couponId = coupon.id;

    const line = await prisma.orderCouponLine.create({
      data: { orderId, couponId, couponCode: coupon.code, discountAmount: 2 },
    });
    expect(line.discountAmount.toString()).toBe('2');

    await expect(
      prisma.orderCouponLine.create({ data: { orderId, couponId, couponCode: coupon.code, discountAmount: 2 } }),
    ).rejects.toThrow();
  });

  it('creates a banner, a manually curated featured section, hero content, and a mega menu', async () => {
    const banner = await prisma.banner.create({
      data: { title: 'Test Banner', slug: 'test-banner', linkType: 'PRODUCT', productId, position: 'homepage_top' },
    });
    bannerId = banner.id;

    const featuredSection = await prisma.featuredSection.create({
      data: {
        title: 'Test Featured',
        slug: 'test-featured',
        sectionType: 'MANUAL',
        categoryId,
        manualProducts: { create: { productId } },
      },
      include: { manualProducts: true },
    });
    featuredSectionId = featuredSection.id;
    expect(featuredSection.manualProducts).toHaveLength(1);

    const heroSlide = await prisma.heroSlide.create({ data: { headline: 'Test Headline' } });
    heroSlideId = heroSlide.id;
    const heroBadge = await prisma.heroTrustBadge.create({ data: { label: 'Free UK Delivery' } });
    heroBadgeId = heroBadge.id;

    const menu = await prisma.menu.create({
      data: {
        name: 'Test Header Menu',
        slug: 'test-header-menu',
        location: 'HEADER',
        items: {
          create: {
            label: 'Test Category Link',
            categoryId,
            megaMenuPanel: {
              create: {
                columns: {
                  create: { title: 'Column 1', links: { create: { label: 'Test Link', categoryId } } },
                },
              },
            },
          },
        },
      },
      include: { items: { include: { megaMenuPanel: { include: { columns: { include: { links: true } } } } } } },
    });
    menuId = menu.id;

    const panel = menu.items[0].megaMenuPanel;
    expect(panel?.columns[0].links[0].label).toBe('Test Link');
  });
});
