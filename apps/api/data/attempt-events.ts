import { attemptEvents, responses, type AttemptEventRow, type Executor } from '@scholis/db';
import { and, asc, eq, sql } from 'drizzle-orm';

export const listAttemptEvents = async (
  db: Executor,
  attemptId: string,
): Promise<AttemptEventRow[]> =>
  db
    .select()
    .from(attemptEvents)
    .where(eq(attemptEvents.attemptId, attemptId))
    .orderBy(asc(attemptEvents.at));

/**
 * The mutation id is the primary key, so a resend is a no-op rather than a
 * duplicate row. Same trick the answer path uses.
 */
export const recordAttemptEvent = async (
  db: Executor,
  values: { id: string; attemptId: string; kind: 'hidden' | 'visible' | 'blur' | 'focus'; at: Date },
): Promise<void> => {
  await db.insert(attemptEvents).values(values).onConflictDoNothing();
};

/**
 * Adds to whatever is already recorded rather than replacing it.
 *
 * A total sent by the client would let a refresh or a second device overwrite
 * time already banked; a delta applied once — the mutation ledger guarantees
 * once — can only ever move forwards.
 */
export const addQuestionTime = async (
  db: Executor,
  input: { attemptId: string; questionId: string; msDelta: number },
): Promise<void> => {
  await db
    .update(responses)
    .set({ timeSpentMs: sql`${responses.timeSpentMs} + ${input.msDelta}` })
    .where(
      and(eq(responses.attemptId, input.attemptId), eq(responses.questionId, input.questionId)),
    );
};
