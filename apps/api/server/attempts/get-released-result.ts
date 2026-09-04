import { findAttemptById } from '@/data/attempts';
import { listKeyedQuestions } from '@/data/questions';
import { listResponsesForAttempt } from '@/data/responses';
import { findTestById } from '@/data/tests';
import { assertAttemptToken } from '@/server/attempt-token';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { releasedResultSchema, type ReleasedResult } from '@scholis/contracts';
import { richTextToPlainText } from '@scholis/schema';
import { z } from 'zod';

export const getReleasedResultInput = z.object({
  attemptId: z.uuid(),
  token: z.string().min(1),
});
export type GetReleasedResultInput = z.infer<typeof getReleasedResultInput>;

// A student reading their own mark. No account, so the attempt token is the
// authorisation — same as sync and submit.
//
// Refuses anything not actually released. An attempt sitting in 'graded' has a
// score, but showing it would leak the mark before the teacher chose to publish
// it, and an attempt in 'submitted' would show a total counting unmarked essays
// as zero.
export const getReleasedResult = async (
  ctx: PublicContext,
  input: GetReleasedResultInput,
): Promise<ReleasedResult> => {
  assertAttemptToken(ctx.attemptTokenSecret, input.token, input.attemptId, ctx.now());

  const attempt = await findAttemptById(ctx.db, input.attemptId);
  if (attempt === null) throw notFound('Attempt');

  if (attempt.releasedAt === null || attempt.status !== 'released') {
    throw invalidState('Your results have not been released yet.');
  }

  const test = await findTestById(ctx.db, attempt.testId);
  if (test === null) throw notFound('Test');

  const [questions, responses] = await Promise.all([
    listKeyedQuestions(ctx.db, attempt.testId),
    listResponsesForAttempt(ctx.db, attempt.id),
  ]);

  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));

  return releasedResultSchema.parse({
    testTitle: test.title,
    takerName: attempt.takerName,
    score: attempt.score ?? 0,
    maxScore: attempt.maxScore ?? 0,
    releasedAt: attempt.releasedAt.toISOString(),
    items: questions.map((question) => ({
      questionId: question.id,
      prompt: richTextToPlainText(question.body),
      points: question.points,
      awarded: byQuestion.get(question.id)?.score ?? 0,
      feedback: byQuestion.get(question.id)?.feedback ?? null,
    })),
  });
};
