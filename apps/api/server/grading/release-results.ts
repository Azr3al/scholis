import { listAttemptsForTest, releaseSubmittedAttempts } from '@/data/attempts';
import { appendEvent } from '@/data/events';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { z } from 'zod';

export const releaseResultsInput = z.object({ testId: z.uuid() });
export type ReleaseResultsInput = z.infer<typeof releaseResultsInput>;

export interface ReleaseSummary {
  released: number;
  /** Attempts held back because a human has not finished marking them. */
  pending: number;
}

// Only releases `graded` attempts. One still in `submitted` has unmarked
// essays, and releasing it shows a total counting those as zero — a number the
// student would reasonably read as their mark.
//
// Partially-marked cohorts are normal, so the ready ones go and the rest are
// reported back.
export const releaseResults = async (
  ctx: AuthedContext,
  input: ReleaseResultsInput,
): Promise<ReleaseSummary> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  if (test.status === 'draft') {
    throw invalidState('This test has not been published, so there is nothing to release.');
  }

  const now = ctx.now();

  return ctx.db.transaction(async (tx) => {
    const released = await releaseSubmittedAttempts(tx, test.id, ctx.actor.userId, now);

    for (const attempt of released) {
      await appendEvent(tx, {
        orgId: ctx.actor.orgId,
        type: 'attempt.released.v1',
        subjectType: 'attempt',
        subjectId: attempt.id,
        payload: { testId: test.id },
        now,
      });
    }

    const all = await listAttemptsForTest(tx, test.id);
    const pending = all.filter((a) => a.status === 'submitted').length;

    return { released: released.length, pending };
  });
};
