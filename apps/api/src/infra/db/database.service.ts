import { Inject, Injectable } from '@nestjs/common';
import {
  SQL_DRIVER,
  type SqlDriver,
  type SqlParam,
  type SqlResult,
  type SqlStatement,
} from './sql-driver.js';

export {
  DatabaseError,
  isForeignKeyViolation,
  isUniqueViolation,
  type SqlParam,
  type SqlStatement,
} from './sql-driver.js';

/**
 * Access to the application database: Cloudflare D1, which is SQLite.
 *
 * The API is the only reader and writer, so authorization is decided by the
 * guards and services in this codebase, not by the database.
 *
 * What is different from a classic SQL connection:
 *   - There are no interactive transactions. Writes that must happen together
 *     go through `batch()`, which is atomic. A batch cannot read a result and
 *     decide what to do next, so ids are generated here (`newId()`) and
 *     anything conditional is expressed in SQL or checked before the batch.
 *   - A statement takes at most 100 parameters. Pass a list of any size as
 *     one JSON parameter and unpack it with `json_each` (see `jsonList()`).
 *   - Placeholders are `?1`, `?2`…; the same one may be used more than once.
 *   - Timestamps are ISO 8601 strings (`now()`), booleans are 0/1, and
 *     `count(*)` is a number.
 */
@Injectable()
export class DatabaseService {
  constructor(@Inject(SQL_DRIVER) private readonly driver: SqlDriver) {}

  query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<SqlResult<T>> {
    return this.driver.query({ sql, params }) as Promise<SqlResult<T>>;
  }

  async rows<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return (await this.query<T>(sql, params)).rows;
  }

  async one<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    return (await this.query<T>(sql, params)).rows[0] ?? null;
  }

  /**
   * Runs the statements as one unit: if any fails, none is applied and the
   * failure is thrown. An empty list is a no-op.
   */
  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    if (statements.length === 0) {
      return [];
    }
    return this.driver.batch(statements);
  }
}

/** The current instant, in the format every timestamp column uses. */
export function now(): string {
  return new Date().toISOString();
}

/** A new row id, for rows written in a batch (which cannot read one back). */
export function newId(): string {
  return crypto.randomUUID();
}

/**
 * A list as a single parameter, for
 * `where id in (select value from json_each(?1))`.
 */
export function jsonList(values: readonly (string | number)[]): string {
  return JSON.stringify(values);
}
