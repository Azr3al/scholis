import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

type Schema = typeof schema;
type Relations = ExtractTablesWithRelations<Schema>;

export type Database = PgDatabase<PgQueryResultHKT, Schema, Relations>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, Relations>;

<<<<<<< HEAD
/**
 * What every `data/` function accepts.
 *
 * Typed as "a database or a transaction" so a service can decide the
 * transaction boundary and pass either one down (IMPLEMENTATION.md §3.1, rule
 * 5). Drizzle expresses this natively, so there is no unit-of-work abstraction
 * and no repository interface — the executor *is* the seam.
 *
 * Deliberately widened over the concrete driver type. Production runs
 * postgres-js; tests run PGlite in-process. Both are `PgDatabase`, so the same
 * query modules run against both without a generic parameter leaking into
 * every call site.
 */
=======
// What every data/ function takes: a database or a transaction.
//
// Services pick the transaction boundary and pass either down. Drizzle types
// this natively, so no unit-of-work abstraction and no repository interface —
// the executor is the seam.
//
// Widened over the concrete driver so the same queries run against postgres-js
// in prod and PGlite in tests.
>>>>>>> master
export type Executor = Database | Tx;
