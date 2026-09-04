import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

<<<<<<< HEAD
/**
 * Append-only decision log. Never updated, never deleted.
 *
 * Exists from day one although nothing reads it yet, because webhooks (Phase 6)
 * are a *projection over this table* rather than a second emission path. Adding
 * it later would mean either a migration that cannot backfill history, or
 * webhooks that fire for events the log never recorded.
 *
 * `seq` is a per-database monotonic counter so a future consumer can detect
 * gaps. Cheap now; impossible to add retroactively with meaningful values.
 */
=======
// Append-only. Never updated, never deleted.
//
// Nothing reads it yet — it's here because webhooks (Phase 6) are a projection
// over this table, not a second emission path. Adding it later means either a
// migration that can't backfill, or webhooks firing for events never recorded.
//
// `seq` lets a future consumer detect gaps. Cheap now, impossible to add
// retroactively with meaningful values.
>>>>>>> master
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'bigint' }).notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),

<<<<<<< HEAD
    /** Versioned per event type, e.g. `attempt.submitted.v1` (DESIGN.md §10). */
=======
    /** Versioned per event type, e.g. `attempt.submitted.v1`. */
>>>>>>> master
    type: text('type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),

<<<<<<< HEAD
    /** Thin. Consumers call back for the body (DESIGN.md §6). */
=======
    /** Thin. Consumers call back for the body. */
>>>>>>> master
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('events_org_seq_idx').on(table.orgId, table.seq),
    index('events_subject_idx').on(table.subjectType, table.subjectId),
  ],
);
