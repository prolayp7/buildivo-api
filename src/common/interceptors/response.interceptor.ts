import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function isPaginatedResult(value: unknown): value is { items: unknown; meta: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'meta' in value
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (result === undefined) {
          return undefined;
        }
        if (isPaginatedResult(result)) {
          return { data: result.items, meta: result.meta };
        }
        return { data: result };
      }),
    );
  }
}
