import { findIdempotentResource, recordIdempotentResource } from '@/data/idempotency';
import {
  countQuestions,
  insertChoiceOptions,
  insertQuestion,
  insertShortAnswerKeys,
  listKeyedQuestions,
} from '@/data/questions';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { assertUsableAnswerKey, questionInput } from '@/server/question-input';
import { toAuthoredQuestion } from '@/server/views';
import { authoredQuestionSchema, type AuthoredQuestion } from '@scholis/contracts';
import { richTextToPlainText } from '@scholis/schema';
import { z } from 'zod';

export const addQuestionInput = z.object({
  testId: z.uuid(),
  question: questionInput,

  /** See `createTest`. A retry must not leave two copies of question four. */
  idempotencyKey: z.uuid().optional(),
});

const RESOURCE_TYPE = 'question';

export type AddQuestionInput = z.infer<typeof addQuestionInput>;

// Pure orchestration: authorise, check state, validate the one rule the type
// system can't express, write three tables in a transaction.
export const addQuestion = async (
  ctx: AuthedContext,
  input: AddQuestionInput,
): Promise<AuthoredQuestion> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  const key = input.idempotencyKey;
  if (key !== undefined) {
    const previous = await findIdempotentResource(ctx.db, key, ctx.actor.orgId, RESOURCE_TYPE);
    if (previous !== null) {
      const authored = (await listKeyedQuestions(ctx.db, input.testId)).find(
        (q) => q.id === previous,
      );
      if (authored !== undefined) return authoredQuestionSchema.parse(authored);
    }
  }

  // Editing a published test would change the paper under students already
  // sitting it. Versioned edits are a Phase 5 concern; refusing is the honest
  // v1 behaviour.
  if (test.status !== 'draft') {
    throw invalidState('This test has been published and can no longer be edited.');
  }

  const q = input.question;
  assertUsableAnswerKey(q);

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

    const options =
      q.type === 'choice' ? await insertChoiceOptions(tx, question.id, q.options) : [];
    if (q.type === 'short') {
      await insertShortAnswerKeys(tx, question.id, q.acceptedAnswers);
    }

    if (key !== undefined) {
      await recordIdempotentResource(tx, {
        key,
        orgId: ctx.actor.orgId,
        resourceType: RESOURCE_TYPE,
        resourceId: question.id,
        now: ctx.now(),
      });
    }

    return toAuthoredQuestion(
      question.id,
      position,
      q,
      options.map((o) => ({ id: o.id, body: o.body, isCorrect: o.isCorrect })),
    );
  });
};
