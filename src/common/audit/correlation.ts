import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const store = new AsyncLocalStorage<string>();

/** The id of the HTTP request being handled (undefined in background jobs). */
export const correlationId = () => store.getStore();

/** Honours an incoming X-Request-Id, otherwise mints one; echoes it on the response. */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  store.run(id, next);
}
