import { listCommentsForTest } from '@/data/attempts';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { notFound } from '@/server/errors';
import {
  attemptCommentSchema,
  attemptCommentsViewSchema,
  type AttemptCommentsView,
} from '@scholis/contracts';
import { z } from 'zod';

export const listCommentsInput = z.object({ testId: z.uuid() });
export type ListCommentsInput = z.infer<typeof listCommentsInput>;

export const listComments = async (
  ctx: AuthedContext,
  input: ListCommentsInput,
): Promise<AttemptCommentsView> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  const rows = await listCommentsForTest(ctx.db, test.id);

  // The query only returns commented attempts, but the row type cannot say so.
  // flatMap restates that for the type system instead of asserting past it.
  const comments = rows.flatMap((row) =>
    row.studentComment === null || row.studentCommentAt === null
      ? []
      : [
          attemptCommentSchema.parse({
            attemptId: row.id,
            takerName: row.takerName,
            submittedAt: row.submittedAt?.toISOString() ?? null,
            body: row.studentComment,
            commentAt: row.studentCommentAt.toISOString(),
          }),
        ],
  );

  return attemptCommentsViewSchema.parse({ comments });
};
