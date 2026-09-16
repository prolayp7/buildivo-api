import { PrismaService } from '../../src/prisma/prisma.service';

describe('Catalog & Tax', () => {
  const prisma = new PrismaService();
  let categoryId: number;
  let brandId: number;
  let conditionId: number;
  let taxRateId: number;
  let attributeId: number;
  let attributeValueId: number;
  let productId: number;
  let variantId: number;

  afterAll(async () => {
    if (variantId) await prisma.productVariantAttribute.deleteMany({ where: { productVariantId: variantId } });
    if (productId) await prisma.productFaq.deleteMany({ where: { productId } });
    if (variantId) await prisma.productVariant.delete({ where: { id: variantId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (attributeValueId) await prisma.productAttributeValue.delete({ where: { id: attributeValueId } });
    if (attributeId) await prisma.productAttribute.delete({ where: { id: attributeId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (brandId) await prisma.brand.delete({ where: { id: brandId } });
    if (conditionId) await prisma.productCondition.delete({ where: { id: conditionId } });
    if (taxRateId) await prisma.taxRate.delete({ where: { id: taxRateId } });
    await prisma.$disconnect();
  });

  it('creates a product with a variant, EAV attribute, and tax rate', async () => {
    const category = await prisma.category.create({
      data: { title: 'Test Graphics Cards', slug: 'test-graphics-cards' },
    });
    categoryId = category.id;

    const brand = await prisma.brand.create({ data: { title: 'Test NVIDIA', slug: 'test-nvidia' } });
    brandId = brand.id;

    const condition = await prisma.productCondition.create({ data: { title: 'Refurbished', slug: 'test-refurbished' } });
    conditionId = condition.id;

    const taxRate = await prisma.taxRate.create({
      data: { title: 'Test Standard', ratePercent: 20.0, isDefault: true },
    });
    taxRateId = taxRate.id;

    const attribute = await prisma.productAttribute.create({
      data: { title: 'Test Memory Size', slug: 'test-memory-size' },
    });
    attributeId = attribute.id;

    const attributeValue = await prisma.productAttributeValue.create({
      data: { attributeId, value: '16GB' },
    });
    attributeValueId = attributeValue.id;

    const product = await prisma.product.create({
      data: {
        categoryId,
        brandId,
        productConditionId: conditionId,
        taxRateId,
        title: 'Test RTX 4070',
        slug: 'test-rtx-4070',
        status: 'ACTIVE',
        faqs: { create: { question: 'Does it fit?', answer: 'Check your case clearance.' } },
      },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        title: '16GB',
        slug: 'test-rtx-4070-16gb',
        price: 549.99,
        stockQty: 10,
        isDefault: true,
        attributes: { create: { attributeId, attributeValueId } },
      },
      include: { attributes: { include: { attribute: true, attributeValue: true } } },
    });
    variantId = variant.id;

    expect(variant.attributes[0].attribute.title).toBe('Test Memory Size');
    expect(variant.attributes[0].attributeValue.value).toBe('16GB');

    const fetchedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { variants: true, faqs: true, taxRate: true, brand: true, productCondition: true },
    });
    expect(fetchedProduct.variants).toHaveLength(1);
    expect(fetchedProduct.faqs).toHaveLength(1);
    expect(fetchedProduct.taxRate?.ratePercent.toString()).toBe('20');
  });

  it('rejects deleting a product that still has a variant (Restrict)', async () => {
    await expect(prisma.product.delete({ where: { id: productId } })).rejects.toThrow();
  });

  it('supports soft-delete on Category via deletedAt', async () => {
    const category = await prisma.category.create({
      data: { title: 'Test Soft-Delete Category', slug: 'test-soft-delete-category' },
    });
    expect(category.deletedAt).toBeNull();

    const updated = await prisma.category.update({
      where: { id: category.id },
      data: { deletedAt: new Date() },
    });
    expect(updated.deletedAt).not.toBeNull();

    await prisma.category.delete({ where: { id: category.id } });
  });
});
