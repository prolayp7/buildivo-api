import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { StorefrontCatalogCacheInvalidationInterceptor } from './storefront-catalog-cache-invalidation.interceptor';

function context(method: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

describe('StorefrontCatalogCacheInvalidationInterceptor', () => {
  const originalUrl = process.env.STOREFRONT_REVALIDATION_URL;
  const originalSecret = process.env.STOREFRONT_REVALIDATION_SECRET;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.STOREFRONT_REVALIDATION_URL;
    else process.env.STOREFRONT_REVALIDATION_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.STOREFRONT_REVALIDATION_SECRET;
    else process.env.STOREFRONT_REVALIDATION_SECRET = originalSecret;
  });

  it('invalidates the storefront catalog after a successful write', async () => {
    process.env.STOREFRONT_REVALIDATION_URL = 'http://storefront.local/api/revalidate/catalog';
    process.env.STOREFRONT_REVALIDATION_SECRET = 'test-secret';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const next = { handle: () => of({ saved: true }) } as CallHandler;

    await expect(lastValueFrom(new StorefrontCatalogCacheInvalidationInterceptor().intercept(context('PATCH'), next)))
      .resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://storefront.local/api/revalidate/catalog',
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-storefront-revalidation-secret': 'test-secret' },
      }),
    );
  });

  it('does not invalidate the catalog for reads', async () => {
    process.env.STOREFRONT_REVALIDATION_URL = 'http://storefront.local/api/revalidate/catalog';
    process.env.STOREFRONT_REVALIDATION_SECRET = 'test-secret';
    const fetchMock = jest.spyOn(global, 'fetch');
    const next = { handle: () => of({ items: [] }) } as CallHandler;

    await expect(lastValueFrom(new StorefrontCatalogCacheInvalidationInterceptor().intercept(context('GET'), next)))
      .resolves.toEqual({ items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the write response successful if storefront revalidation is unreachable', async () => {
    process.env.STOREFRONT_REVALIDATION_URL = 'http://storefront.local/api/revalidate/catalog';
    process.env.STOREFRONT_REVALIDATION_SECRET = 'test-secret';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connection refused'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const next = { handle: () => of({ saved: true }) } as CallHandler;

    await expect(lastValueFrom(new StorefrontCatalogCacheInvalidationInterceptor().intercept(context('POST'), next)))
      .resolves.toEqual({ saved: true });
  });
});
