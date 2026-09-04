import { listAttemptEvents } from '@/data/attempt-events';
import { findAttemptById } from '@/data/attempts';
import { listKeyedQuestions } from '@/data/questions';
import { listResponsesForAttempt } from '@/data/responses';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { attemptMarkingViewSchema, type AttemptMarkingView } from '@scholis/contracts';
import { isShortManuallyGraded, richTextToPlainText } from '@scholis/schema';
import { z } from 'zod';

export const getAttemptMarkingInput = z.object({ attemptId: z.uuid() });
export type GetAttemptMarkingInput = z.infer<typeof getAttemptMarkingInput>;

// One attempt, laid out for marking.
//
// Note what isn't here: answer keys. A marker working through essays has no use
// for them, and a second view carrying keys would double the surface that has
// to stay clean.
export const getAttemptMarking = async (
  ctx: AuthedContext,
  input: GetAttemptMarkingInput,
): Promise<AttemptMarkingView> => {
  const attempt = await findAttemptById(ctx.db, input.attemptId);
  if (attempt === null) throw notFound('Attempt');

  const test = await findTestForOrg(ctx.db, attempt.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Attempt');

  if (attempt.submittedAt === null) {
    throw invalidState('This attempt has not been submitted yet.');
  }

  const [questions, responses, events] = await Promise.all([
    listKeyedQuestions(ctx.db, attempt.testId),
    listResponsesForAttempt(ctx.db, attempt.id),
    listAttemptEvents(ctx.db, attempt.id),
  ]);

  const byQuestion = new Map(responses.map((r) => [r.questionId, r]));

  const items = questions.map((question) => {
    const response = byQuestion.get(question.id);
    const needsHuman =
      question.type === 'essay' ||
      (question.type === 'short' && isShortManuallyGraded(question.settings));
    const marked = response?.gradedAt !== null && response?.gradedAt !== undefined;

    return {
      questionId: question.id,
      type: question.type,
      prompt: richTextToPlainText(question.body),
      points: question.points,
      response: response?.value ?? null,
      awarded: response?.score ?? null,
      feedback: response?.feedback ?? null,
      timeSpentMs: response?.timeSpentMs ?? 0,
      status: needsHuman
        ? marked
          ? ('manual' as const)
          : ('pending' as const)
        : ('auto' as const),
    };
  });

  return attemptMarkingViewSchema.parse({
    attempt: {
      id: attempt.id,
      takerName: attempt.takerName,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      submittedAt: attempt.submittedAt.toISOString(),
      releasedAt: attempt.releasedAt?.toISOString() ?? null,
      overdueSeconds: attempt.overdueSeconds,
    },
    testTitle: test.title,
    items,
    awaitingMarks: items.filter((i) => i.status === 'pending').length,
    // Raw observations, in order. The teacher draws their own conclusion.
    events: events.map((event) => ({ kind: event.kind, at: event.at.toISOString() })),
  });
};
