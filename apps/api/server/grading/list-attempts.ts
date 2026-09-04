import { listAttemptsForTest } from '@/data/attempts';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { notFound } from '@/server/errors';
import {
  attemptSummarySchema,
  gradingStatusSchema,
  type AttemptSummary,
  type GradingStatus,
} from '@scholis/contracts';
import { z } from 'zod';

export const listAttemptsInput = z.object({ testId: z.uuid() });
export type ListAttemptsInput = z.infer<typeof listAttemptsInput>;

export interface AttemptsView {
  attempts: AttemptSummary[];
  status: GradingStatus;
}

// Attempts carry no org of their own, so authorisation goes through the test.
export const listAttempts = async (
  ctx: AuthedContext,
  input: ListAttemptsInput,
): Promise<AttemptsView> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  const rows = await listAttemptsForTest(ctx.db, test.id);

  const attempts = rows.map((row) =>
    attemptSummarySchema.parse({
      id: row.id,
      takerName: row.takerName,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      releasedAt: row.releasedAt?.toISOString() ?? null,
      overdueSeconds: row.overdueSeconds,
    }),
  );

  // 'submitted' means a human still owes it a mark; 'graded' means it's ready
  // to go out. Counting them separately is what lets the UI say "3 of 30 still
  // need marking" instead of just showing a release button that half-works.
  const count = (s: AttemptSummary['status']) => attempts.filter((a) => a.status === s).length;

  return {
    attempts,
    status: gradingStatusSchema.parse({
      testId: test.id,
      total: attempts.length,
      inProgress: count('created') + count('in_progress'),
      awaitingMarking: count('submitted'),
      readyToRelease: count('graded'),
      released: count('released'),
    }),
  };
};
