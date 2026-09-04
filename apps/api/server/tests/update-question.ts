import {
  deleteChoiceOptions,
  deleteShortAnswerKeys,
  findQuestionById,
  insertChoiceOptions,
  insertShortAnswerKeys,
  updateQuestionRow,
} from '@/data/questions';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import { assertChoiceRubricForSave, draftQuestionInput } from '@/server/question-input';
import { toAuthoredQuestion } from '@/server/views';
import type { AuthoredQuestion } from '@scholis/contracts';
import { richTextToPlainText } from '@scholis/schema';
import { z } from 'zod';

export const updateQuestionInput = z.object({
  questionId: z.uuid(),
  question: draftQuestionInput,
});

export type UpdateQuestionInput = z.infer<typeof updateQuestionInput>;

export const updateQuestion = async (
  ctx: AuthedContext,
  input: UpdateQuestionInput,
): Promise<AuthoredQuestion> => {
  const existing = await findQuestionById(ctx.db, input.questionId);
  if (existing === null) throw notFound('Question');

  // Authorised via the question's own test, so a teacher can't reach into
  // another organisation's paper by guessing a question id.
  const test = await findTestForOrg(ctx.db, existing.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Question');

  if (test.status !== 'draft') {
    throw invalidState('This test has been published and can no longer be edited.');
  }

  const q = input.question;

  // Changing the type would strand the options or the answer keys, and the
  // settings blob would be the wrong shape for the new one.
  if (q.type !== existing.type) {
    throw validationFailed(
      `This is a ${existing.type} question. Delete it and add a new one to change its type.`,
    );
  }

  if (q.type === 'choice') {
    assertChoiceRubricForSave(q);
  }

  return ctx.db.transaction(async (tx) => {
    const row = await updateQuestionRow(tx, existing.id, {
      body: q.body,
      bodyText: richTextToPlainText(q.body).slice(0, 4096),
      points: q.points,
      settings: q.settings,
    });

    // Id and position survive the edit — students keep the same question in the
    // same place, and anything already pointing at it stays valid.
    let options: { id: string; body: unknown; isCorrect: boolean }[] = [];

    if (q.type === 'choice') {
      await deleteChoiceOptions(tx, existing.id);
      const inserted = await insertChoiceOptions(tx, existing.id, q.options);
      options = inserted.map((o) => ({ id: o.id, body: o.body, isCorrect: o.isCorrect }));
    }

    if (q.type === 'short') {
      await deleteShortAnswerKeys(tx, existing.id);
      await insertShortAnswerKeys(tx, existing.id, q.acceptedAnswers);
    }

    return toAuthoredQuestion(row.id, row.position, q, options, existing.sectionId);
  });
};
