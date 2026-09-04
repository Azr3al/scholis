import { appendEvent } from '@/data/events';
import { listKeyedQuestions } from '@/data/questions';
import { findTestForOrg, updateTest } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { toTestSummary } from '@/server/views';
import type { TestSummary } from '@scholis/contracts';
import { incompleteQuestionCount } from '@scholis/engine';
import { z } from 'zod';

export const publishTestInput = z.object({ testId: z.uuid() });
export type PublishTestInput = z.infer<typeof publishTestInput>;

// Event goes in the same transaction as the status change — no test that
// published without an event, no event for a publish that rolled back.
// Webhooks project off this log.
export const publishTest = async (
  ctx: AuthedContext,
  input: PublishTestInput,
): Promise<TestSummary> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  if (test.status === 'published') {
    throw invalidState('This test is already published.');
  }
  if (test.status === 'closed') {
    throw invalidState('This test has been closed and cannot be published again.');
  }

  // An empty test would let students "complete" it and receive a mark out of
  // zero, which looks like a scoring bug rather than an authoring mistake.
  const questions = await listKeyedQuestions(ctx.db, test.id);
  if (questions.length === 0) {
    throw invalidState('Add at least one question before publishing.');
  }

  const incomplete = incompleteQuestionCount(questions);
  if (incomplete > 0) {
    throw invalidState(
      `${String(incomplete)} ${incomplete === 1 ? 'question is' : 'questions are'} incomplete. Open each one marked Incomplete and finish it before publishing.`,
    );
  }

  const now = ctx.now();

  return ctx.db.transaction(async (tx) => {
    const updated = await updateTest(tx, test.id, { status: 'published' }, now);
    if (updated === null) throw notFound('Test');

    await appendEvent(tx, {
      orgId: ctx.actor.orgId,
      type: 'test.published.v1',
      subjectType: 'test',
      subjectId: test.id,
      // Thin: ids and counts, never the paper itself.
      payload: { code: updated.code, questionCount: questions.length },
      now,
    });

    return toTestSummary(updated, questions.length);
  });
};
