import { z } from 'zod';
import { responseValueSchema } from './response';

// Everything the take UI needs to render an in-progress attempt.
//
// Plain JSON on purpose — ISO strings not Date, record not Map, array not Set.
// This gets written to IndexedDB on every keystroke and read back after a
// reload. A Set would come back as {} and lose every marked question.
export const attemptStateSchema = z.object({
  attemptId: z.string().min(1),
  startedAt: z.iso.datetime(),

  /** Server-issued. `null` means the test is untimed. */
  deadlineAt: z.iso.datetime().nullable(),

  /** Index into the test package's question array. */
  cursor: z.number().int().nonnegative(),

  /** Keyed by question id. Absent means unanswered. */
  responses: z.record(z.string(), responseValueSchema),

  markedForReview: z.array(z.string()),

  submittedAt: z.iso.datetime().nullable(),

  /** Monotonic per attempt per device. Server resolves LWW with it. */
  clientSeq: z.number().int().nonnegative(),
});

export type AttemptState = z.infer<typeof attemptStateSchema>;
