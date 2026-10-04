import { Injectable, Logger, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { concatMap, Observable } from 'rxjs';

@Injectable()
export class StorefrontCatalogCacheInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(StorefrontCatalogCacheInvalidationInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = context.switchToHttp().getRequest<{ method: string }>().method;
    if (!['POST', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    return next.handle().pipe(concatMap(async (result) => {
      await this.invalidateStorefrontCatalog();
      return result;
    }));
  }

  private async invalidateStorefrontCatalog(): Promise<void> {
    const url = process.env.STOREFRONT_REVALIDATION_URL;
    const secret = process.env.STOREFRONT_REVALIDATION_SECRET;
    if (!url || !secret) return;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'x-storefront-revalidation-secret': secret },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) this.logger.warn(`Storefront catalog revalidation returned ${response.status}`);
    } catch {
      this.logger.warn('Storefront catalog revalidation request failed; cached data will expire by TTL');
    }
  }
}