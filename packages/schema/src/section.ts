import { z } from 'zod';
import { richTextSchema } from './rich-text';

/**
 * A heading over a run of questions.
 *
 * Deliberately not a container: sections hold no questions and impose no
 * ordering. A question carries a `sectionId`, and the flat `position` on the
 * question is still the only thing that decides order. That is what lets the
 * attempt engine stay untouched — the cursor walks one list, and a test with no
 * sections behaves exactly as it did.
 */
export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: richTextSchema.nullable(),
  position: z.number().int().nonnegative(),
});

export type Section = z.infer<typeof sectionSchema>;
