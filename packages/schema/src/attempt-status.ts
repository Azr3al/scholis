import { z } from 'zod';

/**
<<<<<<< HEAD
 * The lifecycle of one taker's run at one test (DESIGN.md §4).
=======
 * The lifecycle of one taker's run at one test.
>>>>>>> master
 *
 * Explicit rather than derived from nullable timestamps, because the teacher's
 * results view needs "started but abandoned" and "submitted but not yet graded"
 * on day one, and those are a `WHERE` clause here versus a puzzle otherwise.
 *
 * `expired` is deliberately absent in v1: an abandoned attempt stays
 * `in_progress` until a teacher force-submits it.
 */
export const attemptStatusSchema = z.enum([
  'created',
  'in_progress',
  'submitted',
  'graded',
  'released',
]);

export type AttemptStatus = z.infer<typeof attemptStatusSchema>;
