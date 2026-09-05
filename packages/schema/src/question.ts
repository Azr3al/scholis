import { z } from 'zod';
import { choiceRubricTierSchema } from './choice-rubric';
import { richTextSchema } from './rich-text';
import { ShortGradingMode } from './short-grading';

// Three types here, five in the authoring UI. True/false, Yes/No and rating
// scales are all `choice` with different settings — new templates shouldn't
// need a migration.

export const choiceSettingsSchema = z.object({
  selection: z.enum(['single', 'multi']),
  /** Which template made this. Presentation only — the scorer ignores it. */
  variant: z.enum(['plain', 'boolean', 'scale']),
  /** Per-tier marks when multi-answer has 2+ correct options; null otherwise. */
  rubric: z.array(choiceRubricTierSchema).nullable().default(null),
  /** Legacy — migrated to `rubric` at score time when rubric is null. */
  partialCredit: z.boolean().optional(),
});
export type ChoiceSettings = z.infer<typeof choiceSettingsSchema>;

export const questionTypeSchema = z.enum(['choice', 'short', 'essay']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const shortSettingsSchema = z.object({
  /** When absent, treated as rubric for stored questions created before this field. */
  // z.enum accepts a TypeScript enum in zod 4; nativeEnum is the deprecated
  // spelling of the same thing.
  gradingMode: z.enum(ShortGradingMode).optional(),
  caseSensitive: z.boolean(),
});
export type ShortSettings = z.infer<typeof shortSettingsSchema>;

export const essaySettingsSchema = z.object({
  minWords: z.number().int().nonnegative().nullable(),
  maxWords: z.number().int().positive().nullable(),
});
export type EssaySettings = z.infer<typeof essaySettingsSchema>;

const questionBaseShape = {
  id: z.string().min(1),
  body: richTextSchema,
  points: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  /**
   * Which heading this question sits under, or null for none. Presentation
   * only — `position` still decides order, so this changes nothing about how
   * an attempt is navigated or scored.
   */
  sectionId: z.string().min(1).nullable().default(null),
};

// ---------------------------------------------------------------------------
// Public shapes — what a student's device is allowed to see.
// ---------------------------------------------------------------------------

export const publicChoiceOptionSchema = z.object({
  id: z.string().min(1),
  body: richTextSchema,
});

export const publicChoiceQuestionSchema = z.object({
  ...questionBaseShape,
  type: z.literal('choice'),
  settings: choiceSettingsSchema,
  options: z.array(publicChoiceOptionSchema).min(2),
});

export const publicShortQuestionSchema = z.object({
  ...questionBaseShape,
  type: z.literal('short'),
  settings: shortSettingsSchema,
});

export const publicEssayQuestionSchema = z.object({
  ...questionBaseShape,
  type: z.literal('essay'),
  settings: essaySettingsSchema,
});

export const publicQuestionSchema = z.discriminatedUnion('type', [
  publicChoiceQuestionSchema,
  publicShortQuestionSchema,
  publicEssayQuestionSchema,
]);
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;

// ---------------------------------------------------------------------------
// Keyed shapes — SERVER ONLY. These carry the answers.
// ---------------------------------------------------------------------------

// Keyed extends public, never the other way round. Derive public by omission
// and a new key field is exposed until someone remembers to omit it.
//
// Side effect worth knowing: publicQuestionSchema.parse(keyed) strips the keys
// for you, at any depth. No hand-written omit to drift out of sync.
export const keyedChoiceOptionSchema = publicChoiceOptionSchema.extend({
  isCorrect: z.boolean(),
});

export const keyedChoiceQuestionSchema = publicChoiceQuestionSchema.extend({
  options: z.array(keyedChoiceOptionSchema).min(2),
});

export const keyedShortQuestionSchema = publicShortQuestionSchema.extend({
  /** Any exact match scores full points. Compared per `settings.caseSensitive`. */
  acceptedAnswers: z.array(z.string().min(1)),
});

/** Essays have no key — they are marked by a human. Kept for union symmetry. */
export const keyedEssayQuestionSchema = publicEssayQuestionSchema;

export const keyedQuestionSchema = z.discriminatedUnion('type', [
  keyedChoiceQuestionSchema,
  keyedShortQuestionSchema,
  keyedEssayQuestionSchema,
]);
export type KeyedQuestion = z.infer<typeof keyedQuestionSchema>;
