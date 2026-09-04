import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Lets a retried create return the original resource instead of a second one.
//
// The UI is optimistic and retries quietly on bad wifi, so without this a
// teacher ends up with three copies of question four.
//
// Separate from `mutations`, which is attempt-scoped. Authoring has no attempt
// to hang off.
//
// `key` is client-generated, so it's deliberately not defaulted.
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: uuid('key').notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** e.g. `test`, `question`. Guards against a key being reused across kinds. */
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Composite, org first. A key only means anything inside the tenant that
    // issued it, so the constraint has to match the lookup.
    //
    // Tried a global unique key first — the insert collided across tenants while
    // the org-scoped read couldn't see what it collided with.
    primaryKey({ columns: [table.orgId, table.key] }),
    index('idempotency_keys_org_created_idx').on(table.orgId, table.createdAt),
  ],
);
