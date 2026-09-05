import { emptyRichText, type KeyedQuestion, type ShortGradingMode } from '@scholis/schema';
import type { ChoiceRubricTier } from '@scholis/schema';

/** Test scaffolding. Excluded from coverage; see `packages/config/vitest.base.js`. */

type Correctness = boolean[];

export const choice = (
  id: string,
  correctness: Correctness,
  settings: {
    selection?: 'single' | 'multi';
    partialCredit?: boolean;
    rubric?: ChoiceRubricTier[] | null;
    points?: number;
  } = {},
): KeyedQuestion => ({
  id,
  type: 'choice',
  body: emptyRichText(),
  points: settings.points ?? 4,
  position: 0,
  sectionId: null,
  settings: {
    selection: settings.selection ?? 'single',
    variant: 'plain',
    rubric: settings.rubric ?? null,
    ...(settings.partialCredit !== undefined ? { partialCredit: settings.partialCredit } : {}),
  },
  options: correctness.map((isCorrect, index) => ({
    id: `${id}-${String(index)}`,
    body: emptyRichText(),
    isCorrect,
  })),
});

export const short = (
  id: string,
  acceptedAnswers: string[],
  settings: { caseSensitive?: boolean; gradingMode?: ShortGradingMode } = {},
  points = 2,
): KeyedQuestion => ({
  id,
  type: 'short',
  body: emptyRichText(),
  points,
  position: 0,
  sectionId: null,
  settings: {
    caseSensitive: settings.caseSensitive ?? false,
    ...(settings.gradingMode !== undefined ? { gradingMode: settings.gradingMode } : {}),
  },
  acceptedAnswers,
});

export const essay = (id: string, points = 10): KeyedQuestion => ({
  id,
  type: 'essay',
  body: emptyRichText(),
  points,
  position: 0,
  sectionId: null,
  settings: { minWords: null, maxWords: null },
});
