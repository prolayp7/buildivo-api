import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

export const mediaUploadDirectory = resolve(
  process.env.MEDIA_UPLOAD_DIR ?? resolve(process.cwd(), 'uploads'),
);

const DEFAULT_STOREFRONT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

function storefrontOrigins(): string[] {
  const configured = process.env.STOREFRONT_ORIGIN;
  return configured ? configured.split(',').map((origin) => origin.trim()).filter(Boolean) : DEFAULT_STOREFRONT_ORIGINS;
}

export function configureApp(app: INestApplication): void {
  mkdirSync(mediaUploadDirectory, { recursive: true });
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
