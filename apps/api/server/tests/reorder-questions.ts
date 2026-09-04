import { listQuestionIdsInOrder, setQuestionPositions } from '@/data/questions';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import { z } from 'zod';

export const reorderQuestionsInput = z.object({
  testId: z.uuid(),
  /** Every question on the test, in the order the teacher wants them. */
  questionIds: z.array(z.uuid()).min(1),
});

export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsInput>;

/**
 * Rewrites question order.
 *
 * Takes the whole list rather than "move question X up one". A move is a
 * relative instruction, and two teachers — or one teacher and a stale tab —
 * applying relative instructions to different starting orders produce an order
 * neither asked for. The full list is idempotent: applying it twice leaves the
 * same result.
 */
export const reorderQuestions = async (
  ctx: AuthedContext,
  input: ReorderQuestionsInput,
): Promise<{ questionIds: string[] }> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  if (test.status !== 'draft') {
    throw invalidState('This test has been published and can no longer be edited.');
  }

  const current = await listQuestionIdsInOrder(ctx.db, input.testId);

  // The new order has to be a permutation of what is already there. Anything
  // else is a client working from a stale list, and silently honouring it would
  // drop a question from the paper or resurrect a deleted one.
  const sameSet =
    current.length === input.questionIds.length &&
    new Set(input.questionIds).size === input.questionIds.length &&
    current.every((id) => input.questionIds.includes(id));

  if (!sameSet) {
    throw validationFailed('That ordering does not match the questions on this test.');
  }

  await ctx.db.transaction(async (tx) => {
    await setQuestionPositions(
      tx,
      input.questionIds.map((id, position) => ({ id, position })),
    );
  });

  return { questionIds: input.questionIds };
};
