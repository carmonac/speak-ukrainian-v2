/**
 * Test-only: the application schema in an in-memory SQLite, behind the same
 * `SqlDriver` contract the gateway bridge implements. D1 is SQLite, so the
 * services run their real SQL here, with no network and no wrangler.
 *
 * Excluded from the build (tsconfig.build.json).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseService } from './database.service.js';
import {
  DatabaseError,
  type SqlDriver,
  type SqlParam,
  type SqlResult,
  type SqlStatement,
} from './sql-driver.js';

const MIGRATIONS_DIR = new URL('../../../../gateway/migrations/', import.meta.url);

type Bound = string | number | null;

export class SqliteTestDriver implements SqlDriver {
  readonly sqlite = new DatabaseSync(':memory:');
  /** Every statement that reached the database, for assertions on size. */
  readonly statements: SqlStatement[] = [];

  constructor() {
    // D1 enforces foreign keys; plain SQLite has to be told.
    this.sqlite.exec('pragma foreign_keys = on');
    for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
      if (file.endsWith('.sql')) {
        this.sqlite.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
      }
    }
  }

  async query(statement: SqlStatement): Promise<SqlResult> {
    return this.run(statement);
  }

  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    this.sqlite.exec('begin');
    try {
      const results = statements.map((s) => this.run(s));
      this.sqlite.exec('commit');
      return results;
    } catch (error) {
      this.sqlite.exec('rollback');
      throw error;
    }
  }

  private run(statement: SqlStatement): SqlResult {
    this.statements.push(statement);
    // The same limit D1 applies.
    if ((statement.params?.length ?? 0) > 100) {
      throw new DatabaseError('too many SQL variables');
    }
    // What the bridge does on the wire: undefined -> null, booleans -> 0/1.
    const params = (statement.params ?? []).map(bind);
    try {
      const rows = this.sqlite.prepare(statement.sql).all(...params) as Record<string, unknown>[];
      const reads = /^\s*(select|with)\b/i.test(statement.sql);
      const changes = reads
        ? 0
        : Number((this.sqlite.prepare('select changes() as n').get() as { n: number }).n);
      return { rows, rowCount: changes };
    } catch (error) {
      throw new DatabaseError(error instanceof Error ? error.message : String(error));
    }
  }
}

function bind(param: SqlParam): Bound {
  if (param === undefined || param === null) return null;
  return typeof param === 'boolean' ? Number(param) : param;
}

export interface TestDatabase {
  db: DatabaseService;
  driver: SqliteTestDriver;
  /** Inserts an account (and its profile) the way sign-up does. */
  addUser(
    id: string,
    options?: { email?: string; role?: 'admin' | 'student'; fullName?: string },
  ): void;
  /** Runs raw SQL, for arranging and inspecting state. */
  all<T = Record<string, unknown>>(sql: string, ...params: Bound[]): T[];
}

export function createTestDatabase(): TestDatabase {
  const driver = new SqliteTestDriver();
  return {
    db: new DatabaseService(driver),
    driver,
    addUser(id, options = {}) {
      driver.sqlite
        .prepare('insert into "user" (id, name, email, role) values (?, ?, ?, ?)')
        .run(
          id,
          options.fullName ?? '',
          options.email ?? `${id}@example.com`,
          options.role ?? 'student',
        );
      driver.sqlite
        .prepare('insert into profiles (id, full_name) values (?, ?)')
        .run(id, options.fullName ?? '');
    },
    all<T>(sql: string, ...params: Bound[]) {
      return driver.sqlite.prepare(sql).all(...params) as T[];
    },
  };
}
