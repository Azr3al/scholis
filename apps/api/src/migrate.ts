import { requireEnv } from '@/lib/db';
import { runMigrations } from '@scholis/db/migrate';
import path from 'node:path';

// Run as its own process before the API starts taking traffic — Railway's
// pre-deploy command. Deliberately not called from the server's boot path: a
// migration that fails should stop the deploy, not leave replicas half-starting
// and racing each other.
//
// The SQL files are copied into the image next to the bundle; MIGRATIONS_DIR
// exists so the path isn't guessed if that layout changes.
const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'migrations');

try {
  await runMigrations({
    connectionString: requireEnv('DATABASE_URL'),
    migrationsFolder,
  });
  console.warn(`Migrations applied from ${migrationsFolder}`);
} catch (error) {
  console.error('Migration failed', error);
  // Non-zero so the platform aborts the deploy rather than rolling out code
  // against a schema that never moved.
  process.exit(1);
}
