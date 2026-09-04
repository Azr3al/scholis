import { countQuestions } from '@/data/questions';
import { listTagsForTests } from '@/data/tags';
import { listTestsForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { testSummarySchema, type TestSummary } from '@scholis/contracts';

// Scoped to the actor's org, not to a caller-supplied one.
export const listTests = async (ctx: AuthedContext): Promise<TestSummary[]> => {
  const rows = await listTestsForOrg(ctx.db, ctx.actor.orgId);
  const testIds = rows.map((row) => row.id);
  const tagsByTest = await listTagsForTests(ctx.db, testIds);

  const summaries = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      code: row.code,
      timeLimitMinutes: row.timeLimitMinutes,
      allowNavigation: row.allowNavigation,
      testTakingMode: row.testTakingMode,
      maxAttempts: row.maxAttempts,
      questionCount: await countQuestions(ctx.db, row.id),
      updatedAt: row.updatedAt.toISOString(),
      tags: tagsByTest.get(row.id) ?? [],
    })),
  );

  // Parsed rather than cast — the schema strips anything the row carries that
  // the contract doesn't declare, so org_id can't ride along by accident.
  return summaries.map((s) => testSummarySchema.parse(s));
};
