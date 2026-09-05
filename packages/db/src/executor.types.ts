import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

type Schema = typeof schema;
type Relations = ExtractTablesWithRelations<Schema>;

export type Database = PgDatabase<PgQueryResultHKT, Schema, Relations>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, Relations>;

// What every data/ function takes: a database or a transaction.
//
// Services pick the transaction boundary and pass either down. Drizzle types
// this natively, so no unit-of-work abstraction and no repository interface —
// the executor is the seam.
//
// Widened over the concrete driver so the same queries run against postgres-js
// in prod and PGlite in tests.
export type Executor = Database | Tx;
