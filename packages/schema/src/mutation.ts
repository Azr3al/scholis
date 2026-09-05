import { z } from 'zod';
import { responseValueSchema } from './response';

// One durable change a taker made, queued in the outbox.
//
// `id` is client-generated and is the idempotency key — server inserts it
// ON CONFLICT DO NOTHING, so redelivery is free.
//
// Two cases rather than one: marking is durable state too, and folding it into
// an answer leaves "flag a question I haven't answered" with nowhere to go.
export const answerMutationSchema = z.object({
  kind: z.literal('answer'),
  id: z.uuid(),
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  value: responseValueSchema,
  clientSeq: z.number().int().nonnegative(),
  at: z.iso.datetime(),
});

export const markMutationSchema = z.object({
  kind: z.literal('mark'),
  id: z.uuid(),
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  marked: z.boolean(),
  clientSeq: z.number().int().nonnegative(),
  at: z.iso.datetime(),
});

/**
 * Time the taker spent on one question, as a delta rather than a total.
 *
 * A delta because two devices, a resend, or a refresh must not fight over a
 * running total: the server adds, and the mutation id makes adding twice
 * impossible. Riding the outbox means timing survives being offline exactly
 * the way answers do, with no second protocol.
 */
export const timingMutationSchema = z.object({
  kind: z.literal('timing'),
  id: z.uuid(),
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  /** Capped client-side; the server clamps again. */
  msDelta: z.number().int().nonnegative(),
  clientSeq: z.number().int().nonnegative(),
  at: z.iso.datetime(),
});

/**
 * The document became hidden, or the window lost focus.
 *
 * What a browser can actually observe, recorded as an observation. It is not
 * evidence of anything on its own — a notification stealing focus looks
 * identical to opening another tab.
 */
export const visibilityMutationSchema = z.object({
  kind: z.literal('visibility'),
  id: z.uuid(),
  attemptId: z.string().min(1),
  state: z.enum(['hidden', 'visible', 'blur', 'focus']),
  clientSeq: z.number().int().nonnegative(),
  at: z.iso.datetime(),
});

export const mutationSchema = z.discriminatedUnion('kind', [
  answerMutationSchema,
  markMutationSchema,
  timingMutationSchema,
  visibilityMutationSchema,
]);
export type Mutation = z.infer<typeof mutationSchema>;

// Capped so one device can't hand the server an unbounded transaction after a
// long offline stretch.
export const SYNC_BATCH_LIMIT = 200;

export const syncRequestSchema = z.object({
  mutations: z.array(mutationSchema).max(SYNC_BATCH_LIMIT),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const syncResponseSchema = z.object({
  /** Ids the server durably accepted. The client clears exactly these. */
  applied: z.array(z.uuid()),
  /** Authoritative clock — client re-derives its countdown offset from this. */
  serverTime: z.iso.datetime(),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;
