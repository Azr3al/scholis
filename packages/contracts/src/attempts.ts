import { attemptStatusSchema, responseValueSchema, richTextSchema } from '@scholis/schema';
import { z } from 'zod';

export const attemptSummarySchema = z.object({
  id: z.uuid(),
  takerName: z.string(),
  status: attemptStatusSchema,
  score: z.number().nullable(),
  maxScore: z.number().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  releasedAt: z.iso.datetime().nullable(),
  overdueSeconds: z.number().int(),
});
export type AttemptSummary = z.infer<typeof attemptSummarySchema>;

export const startedAttemptSchema = attemptSummarySchema.extend({
  // Proves the holder owns this attempt. Returned once, at start.
  token: z.string(),
  startedAt: z.iso.datetime().nullable(),
  serverDeadlineAt: z.iso.datetime().nullable(),
  /** Student-facing question order when randomization is on. Null = canonical. */
  questionOrder: z.array(z.uuid()).nullable(),
});
export type StartedAttempt = z.infer<typeof startedAttemptSchema>;

// One question as it appears to a marker. Carries the student's answer and the
// mark so far, but never the answer key — a teacher marking an essay has no use
// for it, and shipping keys into a second view doubles the surface that has to
// stay clean.
export const markingItemSchema = z.object({
  questionId: z.uuid(),
  type: z.enum(['choice', 'short', 'essay']),
  prompt: z.string(),
  points: z.number().int(),
  response: responseValueSchema.nullable(),
  awarded: z.number().nullable(),
  feedback: richTextSchema.nullable(),
  /** Accumulated milliseconds this taker had the question on screen. */
  timeSpentMs: z.number().int().nonnegative().default(0),
  // 'pending' is distinct from a mark of zero, which is what release gates on.
  status: z.enum(['auto', 'manual', 'pending']),
});
export type MarkingItem = z.infer<typeof markingItemSchema>;

/**
 * One thing the browser observed. Not a verdict — a notification stealing
 * focus is indistinguishable from opening another tab.
 */
export const attemptEventSchema = z.object({
  kind: z.enum(['hidden', 'visible', 'blur', 'focus']),
  at: z.iso.datetime(),
});
export type AttemptEvent = z.infer<typeof attemptEventSchema>;

export const attemptMarkingViewSchema = z.object({
  attempt: attemptSummarySchema,
  testTitle: z.string(),
  items: z.array(markingItemSchema),
  awaitingMarks: z.number().int().nonnegative(),
  /** Times the document was hidden or the window lost focus, in order. */
  events: z.array(attemptEventSchema).default([]),
});
export type AttemptMarkingView = z.infer<typeof attemptMarkingViewSchema>;

export const gradingStatusSchema = z.object({
  testId: z.uuid(),
  total: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  awaitingMarking: z.number().int().nonnegative(),
  readyToRelease: z.number().int().nonnegative(),
  released: z.number().int().nonnegative(),
});
export type GradingStatus = z.infer<typeof gradingStatusSchema>;

export const attemptCommentSchema = z.object({
  attemptId: z.uuid(),
  takerName: z.string(),
  submittedAt: z.iso.datetime().nullable(),
  body: z.string(),
  commentAt: z.iso.datetime(),
});
export type AttemptComment = z.infer<typeof attemptCommentSchema>;

export const attemptCommentsViewSchema = z.object({
  comments: z.array(attemptCommentSchema),
});
export type AttemptCommentsView = z.infer<typeof attemptCommentsViewSchema>;

export const submittedCommentSchema = z.object({
  attemptId: z.uuid(),
  body: z.string(),
  commentAt: z.iso.datetime(),
});
export type SubmittedComment = z.infer<typeof submittedCommentSchema>;

// What a student sees after release. Deliberately not the marking view: no
// per-question status, no marker identity.
export const releasedResultSchema = z.object({
  testTitle: z.string(),
  takerName: z.string(),
  score: z.number(),
  maxScore: z.number(),
  releasedAt: z.iso.datetime(),
  items: z.array(
    z.object({
      questionId: z.uuid(),
      prompt: z.string(),
      points: z.number().int(),
      awarded: z.number(),
      feedback: richTextSchema.nullable(),
  /** Accumulated milliseconds this taker had the question on screen. */
  timeSpentMs: z.number().int().nonnegative().default(0),
    }),
  ),
});
export type ReleasedResult = z.infer<typeof releasedResultSchema>;
