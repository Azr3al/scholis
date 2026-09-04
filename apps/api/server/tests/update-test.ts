import { countQuestions } from '@/data/questions';
import { findTestForOrg, updateTest } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { toTestSummary } from '@/server/views';
import type { TestSummary } from '@scholis/contracts';
import { richTextSchema } from '@scholis/schema';
import { z } from 'zod';

export const updateTestInput = z.object({
  testId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  timeLimitMinutes: z.number().int().positive().nullable(),
  allowNavigation: z.boolean(),
  /** Optional so an older client that doesn't send it can't silently clear it. */
  testTakingMode: z.boolean().optional(),
  maxAttempts: z.number().int().positive().max(20),
  introBody: richTextSchema,
  outroBody: richTextSchema,
  randomizeQuestionOrder: z.boolean(),
});

export type UpdateTestInput = z.infer<typeof updateTestInput>;

// Draft-only. Once published, timing and attempt rules are part of what
// students sat under — changing them would make existing attempts ambiguous.
export const updateTestSettings = async (
  ctx: AuthedContext,
  input: UpdateTestInput,
): Promise<TestSummary> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  if (test.status !== 'draft') {
    throw invalidState('This test has been published and its settings can no longer be edited.');
  }

  const now = ctx.now();
  const updated = await updateTest(
    ctx.db,
    test.id,
    {
      title: input.title,
      timeLimitMinutes: input.timeLimitMinutes,
      allowNavigation: input.allowNavigation,
      ...(input.testTakingMode === undefined ? {} : { testTakingMode: input.testTakingMode }),
      maxAttempts: input.maxAttempts,
      introBody: input.introBody,
      outroBody: input.outroBody,
      randomizeQuestionOrder: input.randomizeQuestionOrder,
    },
    now,
  );
  if (updated === null) throw notFound('Test');

  const questionCount = await countQuestions(ctx.db, test.id);
  return toTestSummary(updated, questionCount);
};
