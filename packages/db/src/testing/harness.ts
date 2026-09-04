import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import type { Database } from '../executor.types';
import * as schema from '../schema';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

export interface TestDb {
  db: Database;
  /** Empty every table, preserving schema. Cheap enough to run between tests. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const TABLES = [
<<<<<<< HEAD
=======
  'sessions',
  'accounts',
  'verifications',
  'idempotency_keys',
>>>>>>> master
  'events',
  'mutations',
  'responses',
  'attempts',
  'short_answer_keys',
  'question_options',
  'questions',
<<<<<<< HEAD
=======
  'test_tag_assignments',
  'test_tags',
>>>>>>> master
  'tests',
  'users',
  'organizations',
] as const;

<<<<<<< HEAD
/**
 * A disposable database for one test file.
 *
 * Defaults to PGlite — real Postgres compiled to WASM, running in-process. No
 * daemon, no container start-up, and perfect isolation because each call gets
 * its own in-memory instance.
 *
 * Set `TEST_DATABASE_URL` to run the identical suite against a real Postgres
 * server. CI does exactly that, so the fast local loop never costs fidelity:
 * PGlite is the same engine, but "same engine" and "same build" are not the
 * same claim, and persistence is where that difference would be expensive.
 */
=======
// Disposable database per test file.
//
// PGlite by default — real Postgres compiled to WASM, in-process. No daemon,
// no container startup, and each call gets its own instance.
//
// Set TEST_DATABASE_URL to run the same suite against a real server. CI does
// that, because "same engine" and "same build" aren't the same claim.
>>>>>>> master
export const createTestDb = async (): Promise<TestDb> => {
  const url = process.env.TEST_DATABASE_URL;
  return url === undefined ? createPgliteDb() : createPostgresDb(url);
};

const createPgliteDb = async (): Promise<TestDb> => {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });

  return {
    db,
    reset: async () => {
      await truncateAll(db);
    },
    close: async () => {
      await client.close();
    },
  };
};

const createPostgresDb = async (url: string): Promise<TestDb> => {
  const client = postgres(url, { max: 1 });
  const db = drizzlePostgres(client, { schema });
  await migratePostgres(db, { migrationsFolder });
  // A shared server is reused across files, so start from a known-empty state
  // rather than assuming the previous run tidied up.
  await truncateAll(db);

  return {
    db,
    reset: async () => {
      await truncateAll(db);
    },
    close: async () => {
      await client.end();
    },
  };
};

<<<<<<< HEAD
/**
 * `TRUNCATE ... CASCADE` in one statement so foreign keys never block the
 * order, and `RESTART IDENTITY` so the events sequence starts from 1 in every
 * test — otherwise assertions on `seq` depend on execution order.
 */
=======
// One statement so FKs never dictate the order, RESTART IDENTITY so the events
// sequence starts at 1 every test.
>>>>>>> master
const truncateAll = async (db: Database): Promise<void> => {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`));
};
