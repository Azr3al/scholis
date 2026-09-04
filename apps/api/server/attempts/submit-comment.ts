import { findAttemptById, setStudentComment } from '@/data/attempts';
import { assertAttemptToken } from '@/server/attempt-token';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import { submittedCommentSchema, type SubmittedComment } from '@scholis/contracts';
import { z } from 'zod';

export const submitCommentInput = z.object({
  attemptId: z.uuid(),
  token: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

export type SubmitCommentInput = z.infer<typeof submitCommentInput>;

export const submitComment = async (
  ctx: PublicContext,
  input: SubmitCommentInput,
): Promise<SubmittedComment> => {
  const now = ctx.now();
  assertAttemptToken(ctx.attemptTokenSecret, input.token, input.attemptId, now);

  const attempt = await findAttemptById(ctx.db, input.attemptId);
  if (attempt === null) throw notFound('Attempt');

  if (attempt.submittedAt === null) {
    throw invalidState('You can only leave feedback after handing in.');
  }

  if (attempt.studentComment !== null && attempt.studentCommentAt !== null) {
    return submittedCommentSchema.parse({
      attemptId: attempt.id,
      body: attempt.studentComment,
      commentAt: attempt.studentCommentAt.toISOString(),
    });
  }

  const body = input.body.trim();
  if (body === '') throw validationFailed('Enter some feedback or skip this step.');

  const updated = await setStudentComment(ctx.db, attempt.id, body, now);
  if (updated === null) throw new Error('Update of attempts returned no rows');

  // Checked separately rather than folded into the line above: both columns
  // were written by that same statement, so either being absent means the row
  // is not what we just wrote — not that the student left the comment empty.
  if (updated.studentComment === null || updated.studentCommentAt === null) {
    throw new Error('Update of attempts returned no rows');
  }

  return submittedCommentSchema.parse({
    attemptId: updated.id,
    body: updated.studentComment,
    commentAt: updated.studentCommentAt.toISOString(),
  });
};
