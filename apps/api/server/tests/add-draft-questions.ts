import {
  countQuestions,
  insertChoiceOptions,
  insertQuestion,
  insertShortAnswerKeys,
} from '@/data/questions';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import type { DraftQuestionInput } from '@/server/question-input';
import { toAuthoredQuestion } from '@/server/views';
import type { AuthoredQuestion } from '@scholis/contracts';
import { emptyRichText, ShortGradingMode } from '@scholis/schema';
import { z } from 'zod';

export const draftQuestionKindSchema = z.enum(['single', 'multi', 'short', 'essay']);

export type DraftQuestionKind = z.infer<typeof draftQuestionKindSchema>;

export const addDraftQuestionsInput = z.object({
  testId: z.uuid(),
  kind: draftQuestionKindSchema,
  count: z.number().int().min(1).max(20),
});

export type AddDraftQuestionsInput = z.infer<typeof addDraftQuestionsInput>;

const templateForKind = (kind: DraftQuestionKind): DraftQuestionInput => {
  const body = emptyRichText();

  switch (kind) {
    case 'short':
      return {
        type: 'short',
        body,
        points: 1,
        settings: { gradingMode: ShortGradingMode.Manual, caseSensitive: false },
        acceptedAnswers: [],
      };
    case 'essay':
      return {
        type: 'essay',
        body,
        points: 1,
        settings: { minWords: null, maxWords: null },
      };
    case 'multi':
      return {
        type: 'choice',
        body,
        points: 1,
        settings: {
          selection: 'multi',
          variant: 'plain',
          rubric: null,
        },
        options: [
          { body: emptyRichText(), isCorrect: false },
          { body: emptyRichText(), isCorrect: false },
        ],
      };
    case 'single':
      return {
        type: 'choice',
        body,
        points: 1,
        settings: {
          selection: 'single',
          variant: 'plain',
          rubric: null,
        },
        options: [
          { body: emptyRichText(), isCorrect: false },
          { body: emptyRichText(), isCorrect: false },
        ],
      };
  }
};

export const addDraftQuestions = async (
  ctx: AuthedContext,
  input: AddDraftQuestionsInput,
): Promise<AuthoredQuestion[]> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  if (test.status !== 'draft') {
    throw invalidState('This test has been published and can no longer be edited.');
  }

  const template = templateForKind(input.kind);

  return ctx.db.transaction(async (tx) => {
    const created: AuthoredQuestion[] = [];
    let position = await countQuestions(tx, input.testId);

    for (let i = 0; i < input.count; i += 1) {
      const q = template;
      const question = await insertQuestion(tx, {
        testId: input.testId,
        type: q.type,
        body: q.body,
        bodyText: '',
        points: q.points,
        position,
        settings: q.settings,
      });
      position += 1;

      const options =
        q.type === 'choice' ? await insertChoiceOptions(tx, question.id, q.options) : [];
      if (q.type === 'short' && q.acceptedAnswers.length > 0) {
        await insertShortAnswerKeys(tx, question.id, q.acceptedAnswers);
      }

      created.push(
        toAuthoredQuestion(
          question.id,
          question.position,
          q,
          options.map((o) => ({ id: o.id, body: o.body, isCorrect: o.isCorrect })),
        ),
      );
    }

    return created;
  });
};
