import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate';

const MIGRATIONS = path.resolve(import.meta.dirname, '../migrations');

/**
 * Tables the migrations actually create, read out of the SQL rather than
 * written down here. A hard-coded list would drift the moment someone adds a
 * migration, and would then be asserting history instead of the schema.
 */
const declaredTables = (): string[] => {
  const names = new Set<string>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?([\w.]+)"?/gi)) {
      const name = match[1];
      if (name !== undefined) names.add(name.replace(/^public\./, ''));
    }
  }
  return [...names].sort();
};

// Needs a real Postgres: the runtime migrator drives postgres-js, which speaks
// the wire protocol, so PGlite isn't a stand-in here. Same convention as the
// rest of the suite — unset TEST_DATABASE_URL and this is skipped.
const ADMIN_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(ADMIN_URL === undefined || ADMIN_URL === '')('runMigrations', () => {
  const dbName = `scholis_migrate_test_${Date.now().toString(36)}`;
  let target = '';

  beforeAll(async () => {
    const admin = postgres(ADMIN_URL ?? '', { max: 1 });
    try {
      // A scratch database, so this never touches whatever the rest of the
      // suite is using.
      await admin.unsafe(`create database "${dbName}"`);
      const url = new URL(ADMIN_URL ?? '');
      url.pathname = `/${dbName}`;
      target = url.toString();
    } catch (error) {
      // A least-privilege application role can't CREATEDB, which is correct for
      // one — so this is a missing capability, not a failure. Left as a skip
      // rather than quietly pointed at a real database, because "migrate an
      // empty database" is the whole point and there'd be nothing empty to use.
      if (!/permission denied to create database/i.test(String(error))) throw error;
      console.warn(
        `Skipping migration tests: ${String(ADMIN_URL).replace(/\/\/[^@]*@/, '//***@')} ` +
          'cannot CREATE DATABASE. Point TEST_DATABASE_URL at a role that can.',
      );
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    if (target === '') return;
    const admin = postgres(ADMIN_URL ?? '', { max: 1 });
    try {
      await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
    } finally {
      await admin.end();
    }
  });

  it('brings an empty database up to the current schema, and is idempotent', async (ctx) => {
    if (target === '') {
      ctx.skip();
      return;
    }

    const expected = declaredTables();
    expect(expected.length).toBeGreaterThan(0);

    await runMigrations({ connectionString: target, migrationsFolder: MIGRATIONS });

    const sql = postgres(target, { max: 1 });
    try {
      const present = async (): Promise<string[]> => {
        const rows = await sql<{ table_name: string }[]>`
          select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'
        `;
        return rows.map((r) => r.table_name);
      };

      const afterFirst = await present();
      for (const table of expected) expect(afterFirst).toContain(table);

      // Something to notice if a re-run were to drop and recreate rather than
      // skip. A wiped row here would be a wiped row in production.
      await sql`insert into organizations (name, slug) values ('Migration Test', ${dbName})`;

      // Second run: drizzle records what it applied, so this should be a no-op
      // rather than an error or a reset.
      await runMigrations({ connectionString: target, migrationsFolder: MIGRATIONS });

      expect(await present()).toEqual(expect.arrayContaining(expected));

      const [org] = await sql<{ slug: string }[]>`
        select slug from organizations where slug = ${dbName}
      `;
      expect(org?.slug).toBe(dbName);
    } finally {
      await sql.end();
    }
  }, 60_000);
});
