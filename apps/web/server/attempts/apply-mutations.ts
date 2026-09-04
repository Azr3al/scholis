import { findAttemptById } from '@/data/attempts';
import { claimMutation } from '@/data/mutations';
import { upsertAnswer, upsertMark } from '@/data/responses';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import { syncRequestSchema, type SyncResponse } from '@scholis/schema';
import { z } from 'zod';

export const applyMutationsInput = z
  .object({ attemptId: z.string().uuid() })
  .and(syncRequestSchema);

export type ApplyMutationsInput = z.infer<typeof applyMutationsInput>;

/**
 * Drain a device's outbox (DESIGN.md §6, rule 3).
 *
 * Two properties make this safe to call repeatedly from a flaky connection:
 *
 * 1. **Idempotent.** Each mutation id is claimed in a ledger with
 *    `ON CONFLICT DO NOTHING`. Its effect is applied only by the call that wins
 *    the insert, so redelivering a batch changes nothing.
 * 2. **Order-independent.** Effects are last-write-wins per (attempt, question)
 *    by `clientSeq`, so a mutation that arrives late carrying a lower sequence
 *    updates nothing instead of resurrecting a stale answer.
 *
 * Everything runs in one transaction: a partially-drained batch would leave the
 * client unable to tell which half to resend.
 */
export const applyMutations = async (
  ctx: PublicContext,
  input: ApplyMutationsInput,
): Promise<SyncResponse> => {
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

  const now = ctx.now();

  const applied = await ctx.db.transaction(async (tx) => {
    const ids: string[] = [];

    for (const mutation of input.mutations) {
      const isNew = await claimMutation(tx, mutation.id, input.attemptId, now);

      if (isNew) {
        if (mutation.kind === 'answer') {
          await upsertAnswer(tx, {
            attemptId: input.attemptId,
            questionId: mutation.questionId,
            value: mutation.value,
            clientSeq: mutation.clientSeq,
            now,
          });
        } else {
          await upsertMark(tx, {
            attemptId: input.attemptId,
            questionId: mutation.questionId,
            marked: mutation.marked,
            clientSeq: mutation.clientSeq,
            // A taker can flag a question they have not answered, so a mark may
            // create the row. An empty choice reads as unanswered everywhere.
            emptyValue: { kind: 'choice', optionIds: [] },
            now,
          });
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
