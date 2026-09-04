import { findAttemptById } from '@/data/attempts';
import { addQuestionTime, recordAttemptEvent } from '@/data/attempt-events';
import { claimMutation } from '@/data/mutations';
import { upsertAnswer, upsertMark } from '@/data/responses';
import { assertAttemptToken } from '@/server/attempt-token';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import { syncRequestSchema, type SyncResponse } from '@scholis/schema';
import { z } from 'zod';

/** One question, one stretch. Half an hour is already generous. */
const MAX_TIMING_DELTA_MS = 30 * 60 * 1000;

export const applyMutationsInput = z
  .object({ attemptId: z.uuid(), token: z.string().min(1) })
  .and(syncRequestSchema);

export type ApplyMutationsInput = z.infer<typeof applyMutationsInput>;

// Drain a device's outbox.
//
// Safe to call repeatedly from a flaky connection: each mutation id is claimed
// in a ledger, so only the call that wins the insert applies the effect, and
// effects are last-write-wins by clientSeq so order doesn't matter.
//
// One transaction for the batch — a half-drained batch leaves the client
// unable to tell which part to resend.
export const applyMutations = async (
  ctx: PublicContext,
  input: ApplyMutationsInput,
): Promise<SyncResponse> => {
  const now = ctx.now();

  // Before anything is read or written. An unguessable id is not authorisation,
  // and the token is what proves the caller is the person sitting the test.
  assertAttemptToken(ctx.attemptTokenSecret, input.token, input.attemptId, now);

  const attempt = await findAttemptById(ctx.db, input.attemptId);
  if (attempt === null) throw notFound('Attempt');

  // Late-arriving writes for a finished attempt are refused rather than
  // silently dropped, so a client holding stale state finds out.
  if (attempt.submittedAt !== null) {
    throw invalidState('This attempt has already been submitted.');
  }

  for (const mutation of input.mutations) {
    if (mutation.attemptId !== input.attemptId) {
      throw validationFailed('A mutation referenced a different attempt.');
    }
  }

  const applied = await ctx.db.transaction(async (tx) => {
    const ids: string[] = [];

    for (const mutation of input.mutations) {
      const isNew = await claimMutation(tx, mutation.id, input.attemptId, now);

      // Only ever applied once — claimMutation is the ledger, so timing deltas
      // and events are as safe to resend as an answer is.
      if (isNew) {
        switch (mutation.kind) {
          case 'answer':
            await upsertAnswer(tx, {
              attemptId: input.attemptId,
              questionId: mutation.questionId,
              value: mutation.value,
              clientSeq: mutation.clientSeq,
              now,
            });
            break;

          case 'mark':
            await upsertMark(tx, {
              attemptId: input.attemptId,
              questionId: mutation.questionId,
              marked: mutation.marked,
              clientSeq: mutation.clientSeq,
              // A taker can flag a question they have not answered, so a mark
              // may create the row. An empty choice reads as unanswered
              // everywhere.
              emptyValue: { kind: 'choice', optionIds: [] },
              now,
            });
            break;

          case 'timing':
            // Clamped again here. A client insisting it spent nine hours on
            // one question is either broken or lying, and neither is worth
            // storing.
            await addQuestionTime(tx, {
              attemptId: input.attemptId,
              questionId: mutation.questionId,
              msDelta: Math.min(mutation.msDelta, MAX_TIMING_DELTA_MS),
            });
            break;

          case 'visibility':
            await recordAttemptEvent(tx, {
              id: mutation.id,
              attemptId: input.attemptId,
              kind: mutation.state,
              at: new Date(mutation.at),
            });
            break;
        }
      }

      // Reported as applied whether or not this call did the work. The client's
      // question is "may I drop this from my outbox?", and for an already-
      // recorded mutation the answer is yes — withholding it would make the
      // device resend forever.
      ids.push(mutation.id);
    }

    return ids;
  });

  return { applied, serverTime: now.toISOString() };
};
