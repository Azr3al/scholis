import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface DbHandle {
  db: ReturnType<typeof drizzle<typeof schema>>;
  close: () => Promise<void>;
}

<<<<<<< HEAD
/**
 * Production client.
 *
 * Returned rather than exported as a module-level singleton, so nothing can
 * reach the database by importing it. Services receive a handle through
 * `ServiceContext` (IMPLEMENTATION.md §3.1, rule 4) — the same reason the
 * engine takes `now` as a parameter instead of reading a clock.
 */
export const createClient = (connectionString: string): DbHandle => {
  const sql = postgres(connectionString, { max: 10 });
=======
// Returns a handle rather than exporting a singleton, so nothing can reach the
// database by importing it. Services get one through ServiceContext.
//
// `max` is per process, so the real ceiling is max × replicas. Managed Postgres
// caps total connections well below what a few replicas at 10 would claim, so
// the caller supplies it and reads the setting from the environment — this
// package stays free of process configuration.
export const createClient = (connectionString: string, max = 10): DbHandle => {
  const sql = postgres(connectionString, { max });
>>>>>>> master
  return {
    db: drizzle(sql, { schema }),
    close: async () => {
      await sql.end();
    },
  };
};
