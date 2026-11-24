import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';

export interface BridgeRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  /** A string is sent as JSON; bytes are sent as they are, with their length. */
  body?: string | Uint8Array;
  /** Give up when no answer has started after this long. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * HTTP access to the gateway's bridge (apps/gateway/src/bridge.ts), which is
 * how the API uses Cloudflare D1 and R2.
 *
 * Those are only usable from inside a Worker, and the API runs in a
 * container, so each operation is one request to the gateway: to
 * `gateway.internal` in the container, to `wrangler dev` on a developer
 * machine.
 */
@Injectable()
export class BridgeClient {
  readonly baseUrl: string;
  private readonly secret: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('BRIDGE_URL', { infer: true }).replace(/\/$/, '');
    this.secret = config.get('BRIDGE_SECRET', { infer: true });
  }

  /** Sends the request. Any HTTP status is returned; only a failure to reach the bridge throws. */
  async send(request: BridgeRequest): Promise<Response> {
    const url = new URL(`${this.baseUrl}${request.path}`);
    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(name, String(value));
      }
    }
    const headers: Record<string, string> = {
      ...(typeof request.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...request.headers,
      ...(this.secret ? { 'x-bridge-secret': this.secret } : {}),
    };

    // The timer covers reaching the bridge and getting its answer, and is
    // cleared then: a large download must be free to take as long as the
    // reader needs.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: request.method,
        headers,
        body: request.body,
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(`The gateway bridge at ${this.baseUrl} could not be reached`, {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** The bridge's own description of a failure, for error messages. */
  async failureOf(response: Response): Promise<{ message: string; kind: string | undefined }> {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; kind?: string };
    } | null;
    return {
      message: body?.error?.message ?? `HTTP ${response.status}`,
      kind: body?.error?.kind,
    };
  }
}
