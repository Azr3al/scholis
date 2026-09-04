import {
  countQuestions,
  insertChoiceOptions,
  insertQuestion,
  insertShortAnswerKeys,
  type QuestionRecord,
} from '@/data/questions';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import {
  choiceSettingsSchema,
  essaySettingsSchema,
  richTextSchema,
  richTextToPlainText,
  shortSettingsSchema,
} from '@scholis/schema';
import { z } from 'zod';

const choiceInput = z.object({
  type: z.literal('choice'),
  body: richTextSchema,
  points: z.number().int().positive().max(100),
  settings: choiceSettingsSchema,
  options: z
    .array(z.object({ body: richTextSchema, isCorrect: z.boolean() }))
    .min(2)
    .max(20),
});

const shortInput = z.object({
  type: z.literal('short'),
  body: richTextSchema,
  points: z.number().int().positive().max(100),
  settings: shortSettingsSchema,
  acceptedAnswers: z.array(z.string().trim().min(1)).min(1).max(20),
});

const essayInput = z.object({
  type: z.literal('essay'),
  body: richTextSchema,
  points: z.number().int().positive().max(100),
  settings: essaySettingsSchema,
});

export const addQuestionInput = z.object({
  testId: z.string().uuid(),
  question: z.discriminatedUnion('type', [choiceInput, shortInput, essayInput]),
});

export type AddQuestionInput = z.infer<typeof addQuestionInput>;

/**
 * Append a question to a draft test.
 *
 * Everything here is orchestration: authorise, check state, validate the one
 * rule the type system cannot express, write three tables in a transaction.
 * There is no scoring logic and no state-machine logic — those live in the core.
 */
export const addQuestion = async (
  ctx: AuthedContext,
  input: AddQuestionInput,
): Promise<QuestionRecord> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  // Editing a published test would change the paper under students already
  // sitting it. Versioned edits are a Phase 5 concern; refusing is the honest
  // v1 behaviour.
  if (test.status !== 'draft') {
    throw invalidState('This test has been published and can no longer be edited.');
  }

  const q = input.question;

  // Zod can express "at least two options" but not "at least one is correct" —
  // a question with no keyed answer scores everyone zero, which a teacher would
  // only discover after the test.
  if (q.type === 'choice' && !q.options.some((o) => o.isCorrect)) {
    throw validationFailed('Mark at least one option as correct.');
  }
  if (q.type === 'choice' && q.settings.selection === 'single') {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (correct !== 1) {
      throw validationFailed('A single-answer question needs exactly one correct option.');
    }
  }

  const position = await countQuestions(ctx.db, input.testId);

  return ctx.db.transaction(async (tx) => {
    const question = await insertQuestion(tx, {
      testId: input.testId,
      type: q.type,
      body: q.body,
      bodyText: richTextToPlainText(q.body).slice(0, 4096),
      points: q.points,
      position,
      settings: q.settings,
    });

    if (q.type === 'choice') {
      await insertChoiceOptions(tx, question.id, q.options);
    } else if (q.type === 'short') {
      await insertShortAnswerKeys(tx, question.id, q.acceptedAnswers);
    }

    return question;
  });
};
