import { countAttemptsByTaker, insertAttempt, type AttemptRecord } from '@/data/attempts';
import { appendEvent } from '@/data/events';
import { findTestByCode } from '@/data/tests';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { z } from 'zod';

export const startAttemptInput = z.object({
  code: z.string().trim().min(1).max(32),
  takerName: z.string().trim().min(1).max(120),
  takerRef: z.string().trim().max(120).nullable(),
});

export type StartAttemptInput = z.infer<typeof startAttemptInput>;

/**
 * Begin a run at a test.
 *
 * Takers have no account (DESIGN.md §2), so identity is a self-declared name.
 * That makes `maxAttempts` a speed bump rather than a control — someone who
 * types a different name gets a fresh attempt. Worth stating plainly: this is
 * an honesty mechanism, and anything stronger needs the roster mode from §9.
 */
export const startAttempt = async (
  ctx: PublicContext,
  input: StartAttemptInput,
): Promise<AttemptRecord> => {
  const test = await findTestByCode(ctx.db, input.code.toUpperCase());
  if (test?.status !== 'published') throw notFound('Test');

  const now = ctx.now();
  if (test.opensAt !== null && now < test.opensAt) {
    throw invalidState('This test is not open yet.');
  }
  if (test.closesAt !== null && now > test.closesAt) {
    throw invalidState('This test has closed.');
  }

  const taken = await countAttemptsByTaker(ctx.db, test.id, input.takerName);
  if (taken >= test.maxAttempts) {
    throw invalidState(
      test.maxAttempts === 1
        ? 'You have already taken this test.'
        : `You have used all ${String(test.maxAttempts)} attempts for this test.`,
    );
  }

  // The deadline is computed and stored once, here. Everything afterwards reads
  // it rather than recomputing from a duration, so a clock that drifts — on the
  // device or the server — cannot lengthen or shorten a sitting mid-flight.
  const serverDeadlineAt =
    test.timeLimitMinutes === null
      ? null
      : new Date(now.getTime() + test.timeLimitMinutes * 60_000);

  return ctx.db.transaction(async (tx) => {
    const attempt = await insertAttempt(tx, {
      testId: test.id,
      takerName: input.takerName,
      takerRef: input.takerRef,
      status: 'in_progress',
      startedAt: now,
      serverDeadlineAt,
      createdAt: now,
      updatedAt: now,
    });

    await appendEvent(tx, {
      orgId: test.orgId,
      type: 'attempt.started.v1',
      subjectType: 'attempt',
      subjectId: attempt.id,
      payload: { testId: test.id },
      now,
    });

    return attempt;
  });
};
