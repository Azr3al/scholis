import { validationFailed } from '@/server/errors';
import {
  choiceSettingsSchema,
  essaySettingsSchema,
  resolveShortGradingMode,
  richTextSchema,
  ShortGradingMode,
  shortSettingsSchema,
  validateChoiceRubric,
} from '@scholis/schema';
import { z } from 'zod';

// Shared by addQuestion and updateQuestion. Sits here rather than in either
// service because two copies of "what a valid question looks like" would drift,
// and the half that drifts is whichever one the tests happen not to cover.

const points = z.number().int().positive().max(100);

const choiceInput = z.object({
  type: z.literal('choice'),
  body: richTextSchema,
  points,
  settings: choiceSettingsSchema,
  options: z
    .array(z.object({ body: richTextSchema, isCorrect: z.boolean() }))
    .min(2)
    .max(20),
});

const shortInput = z.object({
  type: z.literal('short'),
  body: richTextSchema,
  points,
  settings: shortSettingsSchema,
  acceptedAnswers: z.array(z.string().trim().min(1)).max(20),
});

const essayInput = z.object({
  type: z.literal('essay'),
  body: richTextSchema,
  points,
  settings: essaySettingsSchema,
});

const draftShortInput = z.object({
  type: z.literal('short'),
  body: richTextSchema,
  points,
  settings: shortSettingsSchema,
  acceptedAnswers: z.array(z.string()).max(20),
});

export const draftQuestionInput = z.discriminatedUnion('type', [
  choiceInput,
  draftShortInput,
  essayInput,
]);

export type DraftQuestionInput = z.infer<typeof draftQuestionInput>;

export const questionInput = z.discriminatedUnion('type', [choiceInput, shortInput, essayInput]);

export type QuestionInput = z.infer<typeof questionInput>;

// One choice shape, not two that happen to match: the draft union reuses
// `choiceInput` unchanged, and only short answers relax for a draft. A separate
// draft alias would be the same type wearing a different name, which is how a
// union ends up quietly duplicated.
type ChoiceQuestionInput = Extract<QuestionInput, { type: 'choice' }>;

export const assertChoiceRubricForSave = (
  q: ChoiceQuestionInput,
): void => {
  if (q.settings.selection !== 'multi') return;

  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (correctCount < 2) return;

  const message = validateChoiceRubric(q.settings, correctCount, q.points);
  if (message !== null) {
    throw validationFailed(message);
  }
};

export const assertChoiceAnswerKey = (q: ChoiceQuestionInput): void => {
  if (!q.options.some((o) => o.isCorrect)) {
    throw validationFailed('Mark at least one option as correct.');
  }

  if (q.settings.selection === 'single' && q.options.filter((o) => o.isCorrect).length !== 1) {
    throw validationFailed('A single-answer question needs exactly one correct option.');
  }

  assertChoiceRubricForSave(q);
};

type ShortQuestionInput = Extract<QuestionInput, { type: 'short' }>;
type DraftShortQuestionInput = Extract<DraftQuestionInput, { type: 'short' }>;

export const assertShortAnswerKey = (q: ShortQuestionInput | DraftShortQuestionInput): void => {
  if (resolveShortGradingMode(q.settings) !== ShortGradingMode.Rubric) return;

  const answers = q.acceptedAnswers.map((a) => a.trim()).filter((a) => a !== '');
  if (answers.length === 0) {
    throw validationFailed('Add at least one accepted answer.');
  }
};

export const assertUsableAnswerKey = (q: QuestionInput): void => {
  if (q.type === 'choice') assertChoiceAnswerKey(q);
  if (q.type === 'short') assertShortAnswerKey(q);
};
