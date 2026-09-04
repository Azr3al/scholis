import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Runs pending migrations against DATABASE_URL.
 *
 * Deliberately uses drizzle-orm's runtime migrator rather than drizzle-kit:
 * drizzle-kit is a dev dependency and needs the whole toolchain, none of which
 * belongs in a production image. drizzle-orm is already a runtime dependency.
 *
 * Idempotent by construction — drizzle records applied migrations in
 * __drizzle_migrations and skips them on the next run.
 */

// Arbitrary but fixed. Two deploys racing would otherwise both try to create
// the same table; the loser fails and takes a deploy down with it. Postgres
// advisory locks are held on the session and released when it ends, so a
// crashed migrator can't wedge the lock permanently.
const LOCK_ID = 947_213_006;

export interface MigrateOptions {
  connectionString: string;
  migrationsFolder: string;
}

export const runMigrations = async ({
  connectionString,
  migrationsFolder,
}: MigrateOptions): Promise<void> => {
  // max: 1 — migrations are strictly sequential, and the advisory lock has to
  // be taken and released on the same connection to mean anything.
  const sql = postgres(connectionString, { max: 1 });

  try {
    await sql`select pg_advisory_lock(${LOCK_ID})`;
    try {
      await migrate(drizzle(sql), { migrationsFolder });
    } finally {
      await sql`select pg_advisory_unlock(${LOCK_ID})`;
    }
  } finally {
    await sql.end();
  }
};
