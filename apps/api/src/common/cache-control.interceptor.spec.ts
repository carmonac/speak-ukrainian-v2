import 'reflect-metadata';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Public } from '../auth/public.decorator.js';
import { CacheControlInterceptor } from './cache-control.interceptor.js';

/**
 * Real decorators on fixture classes, so the interceptor reads `@Public()` the
 * way it does in the app. The interceptor is constructed directly: the unit
 * config transforms with esbuild, which emits no decorator metadata for Nest's
 * injector to resolve `Reflector` from.
 */
class PrivateController {
  plain(): void {}

  @Public()
  open(): void {}
}

@Public()
class PublicController {
  plain(): void {}
}

/** A response that records headers the way Node's does, case-insensitively. */
class RecordingResponse {
  private readonly headers = new Map<string, string>();

  hasHeader(name: string): boolean {
    return this.headers.has(name.toLowerCase());
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }
}

function httpContext(
  controller: abstract new () => object,
  handler: (...args: never[]) => unknown,
  response: RecordingResponse,
): ExecutionContext {
  return {
    getType: () => 'http',
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ExecutionContext;
}

/** A handler that optionally sets its own header, and records what it saw on entry. */
function handlerOf(
  response: RecordingResponse,
  own?: string,
): { next: CallHandler; seenOnEntry: () => string | undefined } {
  let seen: string | undefined;
  return {
    next: {
      handle: () =>
        defer(() => {
          seen = response.getHeader('Cache-Control');
          if (own !== undefined) {
            response.setHeader('Cache-Control', own);
          }
          return of('ok');
        }),
    },
    seenOnEntry: () => seen,
  };
}

async function run(context: ExecutionContext, next: CallHandler): Promise<unknown> {
  return lastValueFrom(new CacheControlInterceptor(new Reflector()).intercept(context, next));
}

describe('CacheControlInterceptor', () => {
  it('labels an authenticated answer private, no-store', async () => {
    const response = new RecordingResponse();
    const { next } = handlerOf(response);

    const result = await run(
      httpContext(PrivateController, PrivateController.prototype.plain, response),
      next,
    );

    expect(result).toBe('ok');
    expect(response.getHeader('Cache-Control')).toBe('private, no-store');
  });

  it('leaves a @Public() handler without a header', async () => {
    const response = new RecordingResponse();
    const { next } = handlerOf(response);

    await run(httpContext(PrivateController, PrivateController.prototype.open, response), next);

    expect(response.hasHeader('Cache-Control')).toBe(false);
  });

  it('leaves a handler on a @Public() class without a header', async () => {
    const response = new RecordingResponse();
    const { next } = handlerOf(response);

    await run(httpContext(PublicController, PublicController.prototype.plain, response), next);

    expect(response.hasHeader('Cache-Control')).toBe(false);
  });

  it('keeps a header already on the response, the way Nest applies @Header before it', async () => {
    // The only non-public route setting its own policy today answers the same
    // value as the default, so the e2e suite cannot tell this apart; this can.
    const response = new RecordingResponse();
    response.setHeader('Cache-Control', 'private, max-age=60');
    const { next, seenOnEntry } = handlerOf(response);

    await run(httpContext(PrivateController, PrivateController.prototype.plain, response), next);

    expect(seenOnEntry()).toBe('private, max-age=60');
    expect(response.getHeader('Cache-Control')).toBe('private, max-age=60');
  });

  it('lets a handler that sets its own policy win', async () => {
    const response = new RecordingResponse();
    const { next } = handlerOf(response, 'private, max-age=60');

    await run(httpContext(PrivateController, PrivateController.prototype.plain, response), next);

    expect(response.getHeader('Cache-Control')).toBe('private, max-age=60');
  });

  it('sets the default before the handler runs', async () => {
    const response = new RecordingResponse();
    const { next, seenOnEntry } = handlerOf(response);

    await run(httpContext(PrivateController, PrivateController.prototype.plain, response), next);

    expect(seenOnEntry()).toBe('private, no-store');
  });

  it('leaves a non-HTTP context alone', async () => {
    const response = new RecordingResponse();
    const { next } = handlerOf(response);
    const context = {
      getType: () => 'rpc',
      getClass: () => PrivateController,
      getHandler: () => PrivateController.prototype.plain,
      switchToHttp: () => {
        throw new Error('an rpc context has no HTTP response');
      },
    } as unknown as ExecutionContext;

    expect(await run(context, next)).toBe('ok');
    expect(response.hasHeader('Cache-Control')).toBe(false);
  });
});
