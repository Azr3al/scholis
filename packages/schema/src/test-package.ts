import { z } from 'zod';
import { publicQuestionSchema } from './question';
<<<<<<< HEAD
=======
import { sectionSchema } from './section';
>>>>>>> master
import { richTextSchema } from './rich-text';

/**
 * The whole test as it ships to a student's device, fetched once and cached in
<<<<<<< HEAD
 * IndexedDB (DESIGN.md §6, rule 1).
=======
 * IndexedDB.
>>>>>>> master
 *
 * Because every question here is a `publicQuestionSchema`, parsing a
 * database-shaped test through this schema strips every answer key at every
 * nesting depth — see the note in `question.ts`. This type is the security
 * boundary, not just a DTO.
 */
export const testPackageSchema = z.object({
  testId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),

  /** `null` means untimed. */
  timeLimitMinutes: z.number().int().positive().nullable(),

  /** When false, the taker moves strictly forwards. */
  allowNavigation: z.boolean(),

<<<<<<< HEAD
  introBody: richTextSchema,
  outroBody: richTextSchema,

=======
  /**
   * Turns on the in-browser deterrents. Defaulted so packages cached before
   * this existed still parse — the same reasoning as `sections`.
   */
  testTakingMode: z.boolean().default(false),

  introBody: richTextSchema,
  outroBody: richTextSchema,

  /**
   * Headings only. Empty for every test that has never used them.
   *
   * Defaulted rather than required, because this schema also parses packages
   * already sitting in students' IndexedDB from before sections existed.
   * Without the default every one of those would fail validation and be
   * discarded — losing the offline copy of a paper mid-term.
   */
  sections: z.array(sectionSchema).default([]),

>>>>>>> master
  questions: z.array(publicQuestionSchema),
});

export type TestPackage = z.infer<typeof testPackageSchema>;

/** Total marks available. The denominator on every result. */
export const testPackageMaxScore = (pkg: TestPackage): number =>
  pkg.questions.reduce((total, question) => total + question.points, 0);
