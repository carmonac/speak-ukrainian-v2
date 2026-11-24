import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import { PRIVATE_NO_STORE } from './cache-control.js';

/**
 * Labels every answer from a route not marked `@Public()` as
 * `Cache-Control: private, no-store`, unless the route chose its own (ADR-033).
 *
 * The default is set *before* the handler runs, so anything the handler sets
 * afterwards wins: the H5P responders' per-file policies, `sendFile`'s
 * `maxAge`, a plain `res.setHeader`. A tap after the handler would be too late
 * for an `@Res()` route that has already flushed, and would overwrite what the
 * route chose.
 *
 * It sets the default only when no `Cache-Control` is on the response yet.
 * Nest applies `@Header()` metadata before the interceptor chain starts
 * (`router-execution-context.js`: guards, then status, then `setHeaders`, then
 * interceptors), so an unconditional set here would erase a route's own
 * `@Header('Cache-Control', …)`.
 *
 * It does not label errors. Guards throw before any interceptor runs, so a 401
 * or 403 never reaches here; `HttpExceptionFilter` labels every error instead.
 *
 * `@Public()` routes are skipped entirely: their policies are deliberate
 * (ADR-011, ADR-030), and for some of them "no header at all" is the policy.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) {
      const response = context.switchToHttp().getResponse<Response>();
      if (!response.hasHeader('Cache-Control')) {
        response.setHeader('Cache-Control', PRIVATE_NO_STORE);
      }
    }

    return next.handle();
  }
}
