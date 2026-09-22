import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

export const mediaUploadDirectory = resolve(
  process.env.MEDIA_UPLOAD_DIR ?? resolve(process.cwd(), 'uploads'),
);

// Persistent storage buckets under mediaUploadDirectory, kept outside the
// project root (via MEDIA_UPLOAD_DIR) so deploys/rollbacks never touch them.
export const mediaBuckets = {
  productOriginals: 'products/originals',
  productThumbnails: 'products/thumbnails',
  productOptimized: 'products/optimized',
  categories: 'categories',
  brands: 'brands',
  logos: 'logos',
  misc: 'misc',
  temporary: 'temporary',
} as const;

const DEFAULT_STOREFRONT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

function storefrontOrigins(): string[] {
  const configured = process.env.STOREFRONT_ORIGIN;
  return configured ? configured.split(',').map((origin) => origin.trim()).filter(Boolean) : DEFAULT_STOREFRONT_ORIGINS;
}

export function configureApp(app: INestApplication): void {
  for (const bucket of Object.values(mediaBuckets)) mkdirSync(resolve(mediaUploadDirectory, bucket), { recursive: true });
  const staticApp = app as INestApplication & {
    useStaticAssets?: (path: string, options?: { prefix?: string }) => void;
  };
  staticApp.useStaticAssets?.(mediaUploadDirectory, { prefix: '/uploads/' });
  app.enableCors({ origin: storefrontOrigins(), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}
