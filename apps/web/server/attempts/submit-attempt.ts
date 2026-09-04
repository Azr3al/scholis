import { findAttemptById, updateAttempt, type AttemptRecord } from '@/data/attempts';
import { appendEvent } from '@/data/events';
import { listKeyedQuestions } from '@/data/questions';
import { listResponsesForAttempt, setResponseScores } from '@/data/responses';
import { findTestById } from '@/data/tests';
import type { PublicContext } from '@/server/context.types';
import { notFound } from '@/server/errors';
import type { ResponseValue } from '@scholis/schema';
import { score } from '@scholis/scoring';
import { z } from 'zod';

export const submitAttemptInput = z.object({ attemptId: z.string().uuid() });
export type SubmitAttemptInput = z.infer<typeof submitAttemptInput>;

/**
 * Close an attempt and mark everything that can be marked automatically.
 *
 * Calls `score()` from the pure core **directly**. There is deliberately no
 * `autoMark` service: the marking logic already lives in `@scholis/scoring` at
 * 100% coverage, and a service that only forwards to a pure function is the
 * first brick in a tangle (IMPLEMENTATION.md §3.1).
 *
 * Idempotent. Resubmitting returns the existing result rather than re-marking,
 * because the outbox flushes before submit and a dropped response means the
 * device retries — a second submit is expected traffic, not an error.
 */
export const submitAttempt = async (
  ctx: PublicContext,
  input: SubmitAttemptInput,
): Promise<AttemptRecord> => {
  const attempt = await findAttemptById(ctx.db, input.attemptId);
  if (attempt === null) throw notFound('Attempt');
  if (attempt.submittedAt !== null) return attempt;

  const test = await findTestById(ctx.db, attempt.testId);
  if (test === null) throw notFound('Test');

  const [questions, responses] = await Promise.all([
    listKeyedQuestions(ctx.db, attempt.testId),
    listResponsesForAttempt(ctx.db, attempt.id),
  ]);

  const responsesByQuestion: Record<string, ResponseValue> = {};
  for (const response of responses) {
    responsesByQuestion[response.questionId] = response.value;
  }

  // No manual marks yet — essays are unmarked at submit time, which is exactly
  // what `pending_manual` records.
  const report = score({ questions, responses: responsesByQuestion, manualMarks: {} });

  const now = ctx.now();

  // Recomputed server-side rather than trusted from the client. A device that
  // never saw the deadline pass, or whose clock was wound back, still gets an
  // honest overdue figure.
  const overdueSeconds =
    attempt.serverDeadlineAt === null
      ? 0
      : Math.max(0, Math.floor((now.getTime() - attempt.serverDeadlineAt.getTime()) / 1000));

  return ctx.db.transaction(async (tx) => {
    await setResponseScores(
      tx,
      attempt.id,
      report.questionScores
        .filter((q) => q.status === 'auto')
        .map((q) => ({ questionId: q.questionId, score: q.awarded })),
      now,
    );

    // An attempt with essays is `submitted`, not `graded`: a human still has to
    // mark it, and release gating reads this distinction.
    const updated = await updateAttempt(
      tx,
      attempt.id,
      {
        status: report.requiresManualMarking ? 'submitted' : 'graded',
        submittedAt: now,
        overdueSeconds,
        score: report.score,
        maxScore: report.maxScore,
      },
      now,
    );
    if (updated === null) throw notFound('Attempt');

    await appendEvent(tx, {
      orgId: test.orgId,
      type: report.requiresManualMarking ? 'attempt.submitted.v1' : 'attempt.graded.v1',
      subjectType: 'attempt',
      subjectId: attempt.id,
      payload: { testId: test.id, requiresManualMarking: report.requiresManualMarking },
      now,
    });

    return updated;
  });
};
