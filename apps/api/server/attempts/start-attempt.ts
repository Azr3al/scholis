import { countAttemptsByTaker, insertAttempt, type AttemptRecord } from '@/data/attempts';
import { appendEvent } from '@/data/events';
import { claimLaunchToken } from '@/data/launch-tokens';
import { listKeyedQuestions } from '@/data/questions';
import { findTestByCode } from '@/data/tests';
import {
  ATTEMPT_TOKEN_GRACE_MS,
  ATTEMPT_TOKEN_UNTIMED_MS,
  issueAttemptToken,
} from '@/server/attempt-token';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { shuffleQuestionsWithinSections } from '@scholis/engine';
import { z } from 'zod';

export const startAttemptInput = z.object({
  code: z.string().trim().min(1).max(32),
  takerName: z.string().trim().min(1).max(120),
  takerRef: z.string().trim().max(120).nullable(),
  /**
   * A one-time ticket minted for an integrating system.
   *
   * When present it is authoritative: the name and external student id come
   * from the ticket, and whatever the browser sent is discarded. A student who
   * edits the URL therefore edits nothing that matters.
   */
  launchToken: z.string().min(1).max(200).optional(),
});

export type StartAttemptInput = z.infer<typeof startAttemptInput>;

export interface StartedAttempt {
  attempt: AttemptRecord;
  /** Sent with every sync and submit. The only thing between a leaked attempt id and someone else's paper. */
  token: string;
  /** Student-facing order when randomization is on. */
  questionOrder: string[] | null;
}

// Two ways in. A student typing a code declares their own name, so maxAttempts
// is a speed bump rather than a control. A student arriving on a launch ticket
// carries an identity the calling system vouched for, which is what makes the
// resulting mark safe to file against a real person.
export const startAttempt = async (
  ctx: PublicContext,
  input: StartAttemptInput,
): Promise<StartedAttempt> => {
  const test = await findTestByCode(ctx.db, input.code.toUpperCase());
  if (test?.status !== 'published') throw notFound('Test');

  const now = ctx.now();

  // The paper's own window comes first, before anything is consumed. Claiming
  // the ticket up here would burn it on a refusal, leaving a student holding a
  // spent link for a paper that had not opened yet.
  if (test.opensAt !== null && now < test.opensAt) {
    throw invalidState('This test is not open yet.');
  }
  if (test.closesAt !== null && now > test.closesAt) {
    throw invalidState('This test has closed.');
  }

  // Redeemed once the sitting is known to be allowed, because it settles who
  // this is. Claiming is a single atomic update, so a forwarded link opened
  // twice admits one student rather than two sitting under one record.
  let identity = { takerName: input.takerName, takerRef: input.takerRef };
  if (input.launchToken !== undefined) {
    const ticket = await claimLaunchToken(ctx.db, input.launchToken, now);

    // One message for missing, spent and expired alike. Telling them apart
    // would reveal whether a token was ever real.
    const spent = ticket?.testId !== test.id || ticket.expiresAt.getTime() <= now.getTime();
    if (spent) {
      throw invalidState('That link has already been used or has expired. Ask for a new one.');
    }

    identity = { takerName: ticket.takerName, takerRef: ticket.takerRef };
  }

  const taken = await countAttemptsByTaker(ctx.db, test.id, identity.takerName);
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

  const attemptId = ctx.newId();
  let questionOrder: string[] | null = null;

  if (test.randomizeQuestionOrder) {
    const questions = await listKeyedQuestions(ctx.db, test.id);
    questionOrder = shuffleQuestionsWithinSections(
      questions.map((q) => ({
        id: q.id,
        position: q.position,
        sectionId: q.sectionId ?? null,
      })),
      attemptId,
    );
  }

  return ctx.db.transaction(async (tx) => {
    const attempt = await insertAttempt(tx, {
      id: attemptId,
      testId: test.id,
      takerName: identity.takerName,
      takerRef: identity.takerRef,
      status: 'in_progress',
      questionOrder,
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

    // Deadline plus a long grace, rather than a short access-token lifetime.
    // A taker offline for the whole sitting has no way to refresh, so a token
    // that expires mid-attempt would lock them out of their own paper.
    const expiresAt =
      serverDeadlineAt === null
        ? now.getTime() + ATTEMPT_TOKEN_UNTIMED_MS
        : serverDeadlineAt.getTime() + ATTEMPT_TOKEN_GRACE_MS;

    return {
      attempt,
      token: issueAttemptToken(ctx.attemptTokenSecret, { attemptId: attempt.id, expiresAt }),
      questionOrder,
    };
  });
};
