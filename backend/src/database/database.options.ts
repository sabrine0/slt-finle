import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import type { AppConfig } from '../config/app.config';
import { databaseEntities } from './database.entities';
import { databaseMigrations } from './database.migrations';

export function createDatabaseOptions(
  config: AppConfig,
  overrides?: Partial<PostgresConnectionOptions>,
): PostgresConnectionOptions {
  // PGlite — the in-process Postgres used for local dev (port 5433 via
  // .pglite-bridge.mjs) — has a single shared transaction state per
  // database instance, not per client connection.  If TypeORM opens
  // multiple pg-pool connections, one connection's mid-transaction
  // failure cascades to every other connection as Postgres error
  // 25P02 (`in_failed_sql_transaction`) and the whole pool wedges.
  // Pinning the pool to a single connection serialises all access
  // and gives PGlite-like semantics the safety it needs.  The
  // production database is a real Postgres so this only matters for
  // dev, but the cost (≈ serial DB access on a dev machine) is
  // negligible.
  const isPgliteDev =
    config.nodeEnv !== 'production' && config.dbPort === 5433;

  return {
    type: 'postgres',
    host: config.dbHost,
    port: config.dbPort,
    username: config.dbUsername,
    password: config.dbPassword,
    database: config.dbName,
    ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
    entities: databaseEntities,
    migrations: databaseMigrations,
    migrationsTableName: 'typeorm_migrations',
    synchronize: config.dbSynchronize,
    migrationsRun: config.dbRunMigrations,
    // Never log every query: the 30s agent scheduler hammers the DB,
    // and full query logging filled the dev disk with multi-GB logs
    // (which then crashed the backend on failed writes). Keep only the
    // actionable levels in dev; silent in production.
    logging:
      config.nodeEnv !== 'production'
        ? ['error', 'warn', 'schema', 'migration']
        : false,
    extra: isPgliteDev
      ? {
          max: 1,
          // Don't recycle the single connection on idle — that cycles
          // the transaction state and slows the dev loop pointlessly.
          idleTimeoutMillis: 0,
        }
      : undefined,
    ...overrides,
  };
}
