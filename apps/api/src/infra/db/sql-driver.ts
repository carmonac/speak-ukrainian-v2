/** A value that can be bound to a statement. `undefined` binds as null. */
export type SqlParam = string | number | boolean | null | undefined;

export interface SqlStatement {
  sql: string;
  params?: SqlParam[];
}

export interface SqlResult<T = Record<string, unknown>> {
  /** Rows of a select, or of a statement with `returning`. */
  rows: T[];
  /** Rows written by an insert, update or delete. */
  rowCount: number;
}

/**
 * The one thing `DatabaseService` needs from a database: run a statement, or
 * run several atomically. Implemented by the gateway bridge in the running
 * API and by an in-memory SQLite in the tests.
 */
export interface SqlDriver {
  query(statement: SqlStatement): Promise<SqlResult>;
  /** All statements commit, or none do. Results are in statement order. */
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
}

export const SQL_DRIVER = Symbol('SQL_DRIVER');

export type DatabaseErrorKind = 'unique' | 'foreign_key' | 'other';

/** A statement the database refused. `message` is SQLite's own. */
export class DatabaseError extends Error {
  readonly kind: DatabaseErrorKind;

  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
    this.kind = /UNIQUE constraint failed/i.test(message)
      ? 'unique'
      : /FOREIGN KEY constraint failed/i.test(message)
        ? 'foreign_key'
        : 'other';
  }
}

/** A duplicate where one is not allowed, e.g. a page path or a course slug. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.kind === 'unique';
}

/** A row that points at something that does not exist (or is still pointed at). */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.kind === 'foreign_key';
}
