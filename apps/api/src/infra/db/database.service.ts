import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';
import type { Env } from '../../config/configuration.js';

/** Anything a query can run on: the pool, or one client inside a transaction. */
export interface Queryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>>;
}

/**
 * Direct Postgres access to the Supabase database.
 *
 * The API connects as the database owner, so row level security does not apply
 * to it: authorization is decided by the guards and services in this codebase.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy, Queryable {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;

  constructor(config: ConfigService<Env, true>) {
    this.pool = new pg.Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 10,
    });
    this.pool.on('error', (error) => this.logger.error(`Idle Postgres client failed: ${error}`));
  }

  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async rows<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return (await this.pool.query<T>(text, params)).rows;
  }

  async one<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    return (await this.pool.query<T>(text, params)).rows[0] ?? null;
  }

  /** Runs `work` in one transaction, rolling back if it throws. */
  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

/** Postgres unique-violation, e.g. a duplicate page path or course slug. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '23505';
}
