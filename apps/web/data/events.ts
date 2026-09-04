import { events, type EventRow, type Executor } from '@scholis/db';
import { asc, eq } from 'drizzle-orm';

/**
 * Event types are versioned individually, e.g. `attempt.submitted.v1`.
 *
 * Per-type rather than a global schema version (DESIGN.md §10): a global version
 * forces every consumer to handle a bump when one payload changes.
 */
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

/**
 * Append to the decision log.
 *
 * Callers pass the same executor they are already using, so the event lands in
 * the caller's transaction and cannot record something that then rolls back.
 * That is the property webhooks will depend on in Phase 6: the log is the only
 * emission path, so there is no such thing as an event that fired but never
 * happened.
 *
 * Payloads are thin — ids and a timestamp, never the resource body. Consumers
 * call back to read it, so minor PII never sits in another company's request
 * logs and permissions are re-checked at read time.
 */
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
  return toRecord(row);
};

export const listEventsForOrg = async (db: Executor, orgId: string): Promise<EventRecord[]> => {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.orgId, orgId))
    .orderBy(asc(events.seq));
  return rows.map(toRecord);
};
