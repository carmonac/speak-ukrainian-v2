import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';
import {
  DatabaseError,
  type SqlDriver,
  type SqlParam,
  type SqlResult,
  type SqlStatement,
} from './sql-driver.js';

interface BridgeResult {
  results: Record<string, unknown>[];
  meta: { changes: number };
}

interface BridgeError {
  error?: { message?: string; kind?: string };
}

const TIMEOUT_MS = 30_000;

/**
 * Cloudflare D1 through the gateway's bridge (apps/gateway/src/bridge.ts).
 *
 * D1 is only usable from inside a Worker, and the API runs in a container, so
 * every statement is one HTTP request to the gateway: to `gateway.internal`
 * in the container, to `wrangler dev` on a developer machine.
 */
@Injectable()
export class BridgeDriver implements SqlDriver {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('BRIDGE_URL', { infer: true }).replace(/\/$/, '');
    const secret = config.get('BRIDGE_SECRET', { infer: true });
    this.headers = {
      'content-type': 'application/json',
      ...(secret ? { 'x-bridge-secret': secret } : {}),
    };
  }

  async query(statement: SqlStatement): Promise<SqlResult> {
    return toResult(await this.post<BridgeResult>('/d1/query', wire(statement)));
  }

  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    const body = await this.post<{ results: BridgeResult[] }>('/d1/batch', {
      statements: statements.map(wire),
    });
    return body.results.map(toResult);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`The database bridge at ${this.baseUrl} could not be reached`, {
        cause: error,
      });
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const failure = (await response.json().catch(() => ({}))) as BridgeError;
    const message = failure.error?.message ?? `HTTP ${response.status}`;
    if (failure.error?.kind === 'sql') {
      throw new DatabaseError(message);
    }
    throw new Error(`The database bridge refused the request (${response.status}): ${message}`);
  }
}

function wire(statement: SqlStatement): { sql: string; params: Exclude<SqlParam, undefined>[] } {
  return { sql: statement.sql, params: (statement.params ?? []).map((p) => p ?? null) };
}

function toResult(result: BridgeResult): SqlResult {
  return { rows: result.results, rowCount: result.meta.changes };
}
