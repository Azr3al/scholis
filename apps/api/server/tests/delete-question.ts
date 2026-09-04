import {
  deleteQuestion as deleteQuestionRow,
  findQuestionById,
  listQuestionIdsInOrder,
  setQuestionPositions,
} from '@/data/questions';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { z } from 'zod';

export const deleteQuestionInput = z.object({ questionId: z.uuid() });

export type DeleteQuestionInput = z.infer<typeof deleteQuestionInput>;

export const deleteQuestion = async (
  ctx: AuthedContext,
  input: DeleteQuestionInput,
): Promise<{ deleted: true }> => {
  const existing = await findQuestionById(ctx.db, input.questionId);
  if (existing === null) throw notFound('Question');

  const test = await findTestForOrg(ctx.db, existing.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Question');

  if (test.status !== 'draft') {
    throw invalidState('This test has been published and can no longer be edited.');
  }

  return ctx.db.transaction(async (tx) => {
    await deleteQuestionRow(tx, existing.id);

    // Positions have to close up behind the deletion. Leaving a gap works by
    // luck — everything sorts by position and renumbers on read — but the
    // stored order would disagree with what the teacher sees, and the next
    // insert takes its position from the question count, so a gap means two
    // questions claiming the same slot.
    const remaining = await listQuestionIdsInOrder(tx, existing.testId);
    await setQuestionPositions(
      tx,
      remaining.map((id, position) => ({ id, position })),
    );

    return { deleted: true as const };
  });
};
