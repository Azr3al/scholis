import { appendEvent } from '@/data/events';
import { listKeyedQuestions } from '@/data/questions';
import { findTestForOrg, updateTest, type TestRecord } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { z } from 'zod';

export const publishTestInput = z.object({ testId: z.string().uuid() });
export type PublishTestInput = z.infer<typeof publishTestInput>;

/**
 * Make a draft test takeable.
 *
 * The event is appended inside the same transaction as the status change, so
 * there is no such thing as a test that published without an event, or an event
 * for a publish that rolled back. Webhooks (Phase 6) project off this log, and
 * that guarantee is what makes the projection trustworthy.
 */
export const publishTest = async (
  ctx: AuthedContext,
  input: PublishTestInput,
): Promise<TestRecord> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  if (test.status === 'published') {
    throw invalidState('This test is already published.');
  }
  if (test.status === 'closed') {
    throw invalidState('This test has been closed and cannot be published again.');
  }

  // An empty test would let students "complete" it and receive a mark out of
  // zero, which looks like a scoring bug rather than an authoring mistake.
  const questions = await listKeyedQuestions(ctx.db, test.id);
  if (questions.length === 0) {
    throw invalidState('Add at least one question before publishing.');
  }

  const now = ctx.now();

  return ctx.db.transaction(async (tx) => {
    const updated = await updateTest(tx, test.id, { status: 'published' }, now);
    if (updated === null) throw notFound('Test');

    await appendEvent(tx, {
      orgId: ctx.actor.orgId,
      type: 'test.published.v1',
      subjectType: 'test',
      subjectId: test.id,
      // Thin: ids and counts, never the paper itself (DESIGN.md §6).
      payload: { code: updated.code, questionCount: questions.length },
      now,
    });

    return updated;
  });
};
