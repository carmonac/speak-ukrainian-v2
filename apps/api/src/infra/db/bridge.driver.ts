import { Injectable } from '@nestjs/common';
import { BridgeClient } from '../bridge/bridge.client.js';
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

/** Cloudflare D1 through the gateway's bridge: every statement is one request. */
@Injectable()
export class BridgeDriver implements SqlDriver {
  constructor(private readonly bridge: BridgeClient) {}

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
    const response = await this.bridge.send({ method: 'POST', path, body: JSON.stringify(body) });
    if (response.ok) {
      return (await response.json()) as T;
    }
    const failure = await this.bridge.failureOf(response);
    if (failure.kind === 'sql') {
      throw new DatabaseError(failure.message);
    }
    throw new Error(
      `The database bridge refused the request (${response.status}): ${failure.message}`,
    );
  }
}

function wire(statement: SqlStatement): { sql: string; params: Exclude<SqlParam, undefined>[] } {
  return { sql: statement.sql, params: (statement.params ?? []).map((p) => p ?? null) };
}

function toResult(result: BridgeResult): SqlResult {
  return { rows: result.results, rowCount: result.meta.changes };
}
