import { findAttemptById, updateAttempt, type AttemptRecord } from '@/data/attempts';
import { appendEvent } from '@/data/events';
import { listKeyedQuestions } from '@/data/questions';
import { listResponsesForAttempt, setManualScore } from '@/data/responses';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import { emptyRichText, richTextSchema, type ResponseValue } from '@scholis/schema';
import { score } from '@scholis/scoring';
import { z } from 'zod';

export const scoreWrittenAnswerInput = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  score: z.number().min(0),
  feedback: richTextSchema.nullable(),
});

export type ScoreWrittenAnswerInput = z.infer<typeof scoreWrittenAnswerInput>;

/**
 * Record a teacher's mark for one essay.
 *
 * After writing the mark it re-runs `score()` over the whole attempt rather than
 * adding the delta to the stored total. Recomputing from the parts is the only
 * version that stays correct when a mark is *revised* — incrementing would drift
 * every time a teacher changed their mind, and the drift would be invisible.
 */
export const scoreWrittenAnswer = async (
  ctx: AuthedContext,
  input: ScoreWrittenAnswerInput,
): Promise<AttemptRecord> => {
  const attempt = await findAttemptById(ctx.db, input.attemptId);
  if (attempt === null) throw notFound('Attempt');

  // Authorisation is by test ownership: the attempt itself carries no org.
  const test = await findTestForOrg(ctx.db, attempt.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Attempt');

  if (attempt.submittedAt === null) {
    throw invalidState('This attempt has not been submitted yet.');
  }

  const questions = await listKeyedQuestions(ctx.db, attempt.testId);
  const question = questions.find((q) => q.id === input.questionId);
  if (question === undefined) throw notFound('Question');
  if (question.type !== 'essay') {
    throw invalidState('Only written answers are marked by hand.');
  }
  if (input.score > question.points) {
    throw validationFailed(`Score cannot exceed ${String(question.points)}.`);
  }

  const now = ctx.now();

  return ctx.db.transaction(async (tx) => {
    const updatedResponse = await setManualScore(tx, {
      attemptId: attempt.id,
      questionId: input.questionId,
      score: input.score,
      feedback: input.feedback,
      gradedBy: ctx.actor.userId,
      // A taker can submit without writing anything, and that essay still has
      // to be markable — otherwise the attempt never reaches `graded` and can
      // never be released.
      emptyValue: { kind: 'essay', doc: emptyRichText() },
      now,
    });
    if (updatedResponse === null) throw notFound('Response');

    const responses = await listResponsesForAttempt(tx, attempt.id);

    const responsesByQuestion: Record<string, ResponseValue> = {};
    const manualMarks: Record<string, number> = {};
    for (const response of responses) {
      responsesByQuestion[response.questionId] = response.value;
      if (response.gradedAt !== null && response.score !== null) {
        manualMarks[response.questionId] = response.score;
      }
    }

    const report = score({ questions, responses: responsesByQuestion, manualMarks });

    const updated = await updateAttempt(
      tx,
      attempt.id,
      {
        // Back to `submitted` if other essays remain unmarked. Release gating
        // depends on `graded` meaning *fully* marked.
        status: report.requiresManualMarking ? 'submitted' : 'graded',
        score: report.score,
        maxScore: report.maxScore,
      },
      now,
    );
    if (updated === null) throw notFound('Attempt');

    if (!report.requiresManualMarking) {
      await appendEvent(tx, {
        orgId: ctx.actor.orgId,
        type: 'attempt.graded.v1',
        subjectType: 'attempt',
        subjectId: attempt.id,
        payload: { testId: test.id },
        now,
      });
    }

    return updated;
  });
};
