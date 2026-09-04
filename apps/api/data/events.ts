import {
  events,
  webhookDeliveries,
  webhookEndpoints,
  type EventRow,
  type Executor,
} from '@scholis/db';
import { and, asc, eq, gt } from 'drizzle-orm';

// Versioned per type, not globally — a global version forces every consumer to
// handle a bump when one payload changes.
export type EventType =
  | 'test.published.v1'
  | 'test.closed.v1'
  | 'attempt.started.v1'
  | 'attempt.submitted.v1'
  | 'attempt.graded.v1'
  | 'attempt.released.v1';

export interface EventRecord {
  id: string;
  seq: bigint;
  orgId: string;
  type: EventType;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

const toRecord = (row: EventRow): EventRecord => ({
  id: row.id,
  seq: row.seq,
  orgId: row.orgId,
  type: row.type as EventType,
  subjectType: row.subjectType,
  subjectId: row.subjectId,
  payload: row.payload,
  occurredAt: row.occurredAt,
});

// Takes the caller's executor so the event lands in their transaction — no such
// thing as an event that fired but rolled back. Webhooks depend on that.
//
// Payloads stay thin: ids and a timestamp, never the resource body. Consumers
// call back to read it, so PII doesn't sit in someone else's request logs.
//
// Queueing the deliveries happens here rather than at each of the four call
// sites, and inside the same transaction, so an event that happened always has
// its deliveries waiting even if the process dies immediately afterwards.
// Nothing is *sent* from in here — an HTTP call inside this transaction would
// make marking a paper depend on somebody else's server being up.
export const appendEvent = async (
  db: Executor,
  args: {
    orgId: string;
    type: EventType;
    subjectType: string;
    subjectId: string;
    payload?: Record<string, unknown>;
    now: Date;
  },
): Promise<EventRecord> => {
  const [row] = await db
    .insert(events)
    .values({
      orgId: args.orgId,
      type: args.type,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      payload: args.payload ?? {},
      occurredAt: args.now,
    })
    .returning();

  if (row === undefined) throw new Error('Insert into events returned no rows');

  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, args.orgId), eq(webhookEndpoints.active, true)));

  if (endpoints.length > 0) {
    await db.insert(webhookDeliveries).values(
      endpoints.map((endpoint) => ({
        endpointId: endpoint.id,
        eventId: row.id,
        // Copied onto the delivery so the pump can order a batch without
        // joining back to events on every pass.
        seq: row.seq,
        // The caller's clock, not the database's. Every other timestamp here
        // comes from the context so tests can pin it; leaving this one to
        // `defaultNow()` made a delivery's due time real wall-clock time while
        // the event around it was whatever the test said.
        nextAttemptAt: args.now,
      })),
    );
  }

  return toRecord(row);
};

export const findEventById = async (db: Executor, id: string): Promise<EventRecord | null> => {
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return row === undefined ? null : toRecord(row);
};

/**
 * Events after a sequence number, for a consumer catching up.
 *
 * The backstop behind at-least-once delivery: `seq` is monotonic per
 * organisation, so a consumer that never received a webhook can still notice
 * the gap and ask for what it missed. This is the reason the column exists —
 * a value that cannot be added retroactively with any meaning.
 */
export const listEventsForOrgSince = async (
  db: Executor,
  orgId: string,
  since: bigint,
  limit: number,
): Promise<EventRecord[]> => {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId), gt(events.seq, since)))
    .orderBy(asc(events.seq))
    .limit(limit);
  return rows.map(toRecord);
};

export const listEventsForOrg = async (db: Executor, orgId: string): Promise<EventRecord[]> => {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.orgId, orgId))
    .orderBy(asc(events.seq));
  return rows.map(toRecord);
};
