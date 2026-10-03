import { CapabilitiesService } from '../../../capabilities/capabilities.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { StorefrontProductsService } from './storefront-products.service';

describe('StorefrontProductsService.routeResolution', () => {
  const prisma = {
    product: { findFirst: jest.fn() },
    productSlugRedirect: { findUnique: jest.fn() },
    category: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const service = new StorefrontProductsService(prisma, {} as CapabilitiesService);

  beforeEach(() => jest.clearAllMocks());

  it('lets active products continue to the product page', async () => {
    prisma.product.findFirst = jest.fn().mockResolvedValue({
      id: 2, slug: 'active-product', status: 'ACTIVE', deletedAt: null,
      offlineRedirectBehavior: 'NOT_FOUND', redirectTargetCategoryId: null, categoryId: 4,
    });

    await expect(service.routeResolution('active-product')).resolves.toEqual({ action: 'ACTIVE' });
  });

  it('returns a category redirect for archived products', async () => {
    prisma.product.findFirst = jest.fn().mockResolvedValue({
      id: 2, slug: 'old-product', status: 'ARCHIVED', deletedAt: null,
      offlineRedirectBehavior: 'REDIRECT_CATEGORY_301', redirectTargetCategoryId: 8, categoryId: 4,
    });
    prisma.category.findFirst = jest.fn().mockResolvedValue({ slug: 'replacement-category' });

    await expect(service.routeResolution('old-product')).resolves.toEqual({
      action: 'REDIRECT', statusCode: 301, targetPath: '/c/replacement-category',
    });
  });

  it('returns gone for archived products configured as permanently removed', async () => {
    prisma.product.findFirst = jest.fn().mockResolvedValue({
      id: 2, slug: 'gone-product', status: 'ARCHIVED', deletedAt: null,
      offlineRedirectBehavior: 'GONE', redirectTargetCategoryId: null, categoryId: 4,
    });
    prisma.category.findFirst = jest.fn().mockResolvedValue({ slug: 'tools' });

    await expect(service.routeResolution('gone-product')).resolves.toEqual({ action: 'GONE', targetPath: '/c/tools' });
  });

  it('permanently redirects an old slug to the product current slug', async () => {
    prisma.product.findFirst = jest.fn().mockResolvedValue(null);
    prisma.productSlugRedirect.findUnique = jest.fn().mockResolvedValue({
      product: {
        id: 2, slug: 'new-product-name', status: 'ACTIVE', deletedAt: null,
        offlineRedirectBehavior: 'NOT_FOUND', redirectTargetCategoryId: null, categoryId: 4,
      },
    });

    await expect(service.routeResolution('old-product-name')).resolves.toEqual({
      action: 'REDIRECT', statusCode: 301, targetPath: '/p/new-product-name',
    });
  });
});

describe('StorefrontProductsService.compatibleProducts', () => {
  const prisma = {
    product: { findFirst: jest.fn(), findMany: jest.fn() },
    productCompatibilityLink: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const service = new StorefrontProductsService(prisma, {} as CapabilitiesService);

  beforeEach(() => jest.clearAllMocks());

  it('returns an explicitly linked product when compatibility facts are absent', async () => {
    prisma.product.findFirst = jest.fn().mockResolvedValue({ id: 10, compatibility: null });
    prisma.productCompatibilityLink.findMany = jest.fn().mockResolvedValue([{ compatibleProductId: 20 }]);
    prisma.product.findMany = jest.fn().mockResolvedValue([{ id: 20 }]);
    const byIds = jest.spyOn(service, 'byIds').mockResolvedValue([]);

    await expect(service.compatibleProducts('bare-drill', {})).resolves.toEqual([]);
    expect(byIds).toHaveBeenCalledWith([20]);
  });
});