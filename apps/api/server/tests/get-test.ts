import { countQuestions, listKeyedQuestions } from '@/data/questions';
import { listSections } from '@/data/sections';
import { listTagsForTest } from '@/data/tags';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { notFound } from '@/server/errors';
import { testDetailSchema, type TestDetail } from '@scholis/contracts';
import { z } from 'zod';

export const getTestInput = z.object({ testId: z.uuid() });
export type GetTestInput = z.infer<typeof getTestInput>;

// The authoring view. This one *does* carry answer keys — the teacher wrote
// them, and can't edit a question without seeing which option is right.
//
// Which is why it's org-scoped and lives behind AuthedContext, while the
// student's package (get-test-package) takes a code and strips keys.
export const getTest = async (ctx: AuthedContext, input: GetTestInput): Promise<TestDetail> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  const [questions, sections, tags] = await Promise.all([
    listKeyedQuestions(ctx.db, test.id),
    listSections(ctx.db, test.id),
    listTagsForTest(ctx.db, test.id),
  ]);

  return testDetailSchema.parse({
    id: test.id,
    title: test.title,
    status: test.status,
    code: test.code,
    timeLimitMinutes: test.timeLimitMinutes,
    allowNavigation: test.allowNavigation,
    testTakingMode: test.testTakingMode,
    maxAttempts: test.maxAttempts,
    questionCount: await countQuestions(ctx.db, test.id),
    updatedAt: test.updatedAt.toISOString(),
    introBody: test.introBody,
    outroBody: test.outroBody,
    randomizeQuestionOrder: test.randomizeQuestionOrder,
    tags,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
    })),
    questions,
  });
};
