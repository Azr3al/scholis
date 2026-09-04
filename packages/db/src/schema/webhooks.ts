import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { events } from './events';
import { organizations } from './organizations';

/**
 * Where an organisation's events get delivered.
 *
 * The signing secret is stored as it will be used, not hashed, and that
 * asymmetry with `api_client_secrets` is deliberate rather than sloppy. An
 * inbound credential only ever has to be *compared*, so a hash is enough. An
 * outbound signature has to be *reproduced* on every delivery, so the value
 * itself is required. Same reason every webhook provider stores yours.
 */
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    signingSecret: text('signing_secret').notNull(),
    /** Turned off rather than deleted, so a paused endpoint keeps its history. */
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('webhook_endpoints_org_idx').on(table.orgId)],
);

/**
 * One row per event per endpoint: the queue, and the audit trail.
 *
 * Rows are written in the same transaction that appends the event, so an event
 * that happened always has a delivery waiting even if the process dies a
 * microsecond later. Nothing is sent from inside that transaction — an HTTP
 * call there would make marking a paper depend on someone else's server being
 * up.
 *
 * Delivery is at-least-once. Consumers must key on the event id, and
 * `events.seq` is monotonic per organisation so a consumer that misses one
 * entirely can still detect the gap and backfill.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Denormalised so the pump can order a batch without joining events. */
    seq: bigint('seq', { mode: 'bigint' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    /** When the pump may next pick this up. Backoff is a write to this column. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    /** Kept after success too — a delivery that succeeded on retry says something. */
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The pump's only query: undelivered, due, oldest first.
    index('webhook_deliveries_due_idx').on(table.deliveredAt, table.nextAttemptAt, table.seq),
    index('webhook_deliveries_endpoint_idx').on(table.endpointId),
  ],
);
