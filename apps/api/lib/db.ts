import { createClient, type Database } from '@scholis/db';
import { sql } from 'drizzle-orm';

// Composition root — the one sanctioned module-level instance.
//
// createClient returns a handle rather than exporting a singleton so services
// can't reach the DB by importing it. Something has to build it though, and
// that's here, at the edge.
//
// Lazy so importing this doesn't open a connection — Next loads route handlers
// at build time, and there's no database on a build machine.
let handle: { db: Database; close: () => Promise<void> } | null = null;

export const getDb = (): Database => {
  handle ??= createClient(requireEnv('DATABASE_URL'), poolMax());
  return handle.db;
};

/**
 * Connections this process will open, multiplied by however many replicas run.
 * That product is what matters: managed Postgres plans cap total connections,
 * and this default is sized for one or two instances.
 */
export const poolMax = (): number => {
  const raw = process.env.DB_POOL_MAX;
  if (raw === undefined || raw === '') return 10;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`DB_POOL_MAX must be a positive integer, got "${raw}"`);
  }
  return parsed;
};

/**
 * One cheap round trip, for the readiness probe.
 *
 * Never throws — the caller wants a yes or no, and an exception here would be
 * reported as a 500 rather than as "not ready yet". The timeout matters because
 * an unreachable host makes the driver wait far longer than a probe should.
 */
export const pingDb = async (timeoutMs = 2000): Promise<boolean> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Database did not respond in time'));
        }, timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};
