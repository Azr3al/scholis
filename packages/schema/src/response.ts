import { z } from 'zod';
import { richTextSchema, richTextToPlainText, textToRichText, type RichText } from './rich-text';

// One taker's answer to one question.
//
// The `kind` discriminator duplicates the question's type on purpose —
// mutations sync independently of test packages, so the sync endpoint has to
// parse a response without loading its question.
export const choiceResponseSchema = z.object({
  kind: z.literal('choice'),
  optionIds: z.array(z.string().min(1)),
});

const shortResponseDocSchema = z.object({
  kind: z.literal('short'),
  doc: richTextSchema,
});

const shortResponseLegacySchema = z.object({
  kind: z.literal('short'),
  text: z.string(),
});

/** Accepts legacy `{ text }` payloads from older clients and normalises to `doc`. */
export const shortResponseSchema = z
  .union([shortResponseDocSchema, shortResponseLegacySchema])
  .transform((val): { kind: 'short'; doc: RichText } => {
    if ('doc' in val) return val;
    return { kind: 'short', doc: textToRichText(val.text) };
  });

export const essayResponseSchema = z.object({
  kind: z.literal('essay'),
  doc: richTextSchema,
});

export const responseValueSchema = z.union([
  choiceResponseSchema,
  shortResponseSchema,
  essayResponseSchema,
]);
export type ResponseValue = z.infer<typeof responseValueSchema>;

/** The `kind` a given question type expects. Used to reject mismatched responses. */
export const responseKindForQuestionType = {
  choice: 'choice',
  short: 'short',
  essay: 'essay',
} as const satisfies Record<'choice' | 'short' | 'essay', ResponseValue['kind']>;

// "Present but empty" has to read as unanswered, or the UI cheerfully reports
// 20/20 to a student who typed nothing.
export const isAnswered = (value: ResponseValue): boolean => {
  switch (value.kind) {
    case 'choice':
      return value.optionIds.length > 0;
    case 'short':
      return richTextToPlainText(value.doc).trim().length > 0;
    case 'essay':
      return value.doc.content.length > 0;
  }
};
