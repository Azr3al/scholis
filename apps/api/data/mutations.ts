import { mutations, type Executor } from '@scholis/db';

/**
 * Claim a mutation id in the idempotency ledger.
 *
 * Returns `true` when this call was the one that inserted it, `false` when it
 * had already been applied. That return value is the whole mechanism: a caller
 * applies the mutation's effect only when it wins the insert, so redelivering a
 * batch after a flaky connection cannot double-apply anything.
 *
 * `ON CONFLICT DO NOTHING` rather than a read-then-write, because a read-then-
 * write races with a concurrent retry from the same device — two tabs, or a
 * background sync firing while the foreground one is mid-flight.
 */
export const claimMutation = async (
  db: Executor,
  id: string,
  attemptId: string,
  now: Date,
): Promise<boolean> => {
  const rows = await db
    .insert(mutations)
    .values({ id, attemptId, appliedAt: now })
    .onConflictDoNothing()
    .returning({ id: mutations.id });

  return rows.length > 0;
};
