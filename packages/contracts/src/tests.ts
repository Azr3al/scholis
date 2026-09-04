import {
  choiceSettingsSchema,
  essaySettingsSchema,
  richTextSchema,
  sectionSchema,
  shortSettingsSchema,
} from '@scholis/schema';
import { z } from 'zod';

export const testStatusSchema = z.enum(['draft', 'published', 'closed']);

export const testTagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.number().int().nonnegative().optional(),
});
export type TestTag = z.infer<typeof testTagSchema>;

export const testTagSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
export type TestTagSummary = z.infer<typeof testTagSummarySchema>;

// What a teacher sees in a list. No org id, no createdBy, no lti_context_id —
// the row has columns the client has no business knowing about.
export const testSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: testStatusSchema,
  code: z.string(),
  timeLimitMinutes: z.number().int().nullable(),
  allowNavigation: z.boolean(),
  testTakingMode: z.boolean().default(false),
  maxAttempts: z.number().int(),
  questionCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  tags: z.array(testTagSummarySchema).default([]),
});
export type TestSummary = z.infer<typeof testSummarySchema>;

// The authoring view. Unlike the student's package this *does* carry answer
// keys — the teacher wrote them. Which is exactly why it's a separate shape
// with its own endpoint and its own authorisation.
export const authoredChoiceOptionSchema = z.object({
  id: z.uuid(),
  body: richTextSchema,
  isCorrect: z.boolean(),
});

export const authoredQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.uuid(),
    type: z.literal('choice'),
    body: richTextSchema,
    points: z.number().int(),
    position: z.number().int(),
    /** Heading this question sits under, or null. Presentation only. */
    sectionId: z.string().min(1).nullable().default(null),
    settings: choiceSettingsSchema,
    options: z.array(authoredChoiceOptionSchema),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('short'),
    body: richTextSchema,
    points: z.number().int(),
    position: z.number().int(),
    /** Heading this question sits under, or null. Presentation only. */
    sectionId: z.string().min(1).nullable().default(null),
    settings: shortSettingsSchema,
    acceptedAnswers: z.array(z.string()),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('essay'),
    body: richTextSchema,
    points: z.number().int(),
    position: z.number().int(),
    /** Heading this question sits under, or null. Presentation only. */
    sectionId: z.string().min(1).nullable().default(null),
    settings: essaySettingsSchema,
  }),
]);
export type AuthoredQuestion = z.infer<typeof authoredQuestionSchema>;

export const testDetailSchema = testSummarySchema.extend({
  introBody: richTextSchema,
  outroBody: richTextSchema,
  randomizeQuestionOrder: z.boolean(),
  /** Headings over the question list. Empty on tests that never used them. */
  sections: z.array(sectionSchema).default([]),
  questions: z.array(authoredQuestionSchema),
});
export type TestDetail = z.infer<typeof testDetailSchema>;
