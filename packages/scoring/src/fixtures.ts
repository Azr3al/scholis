<<<<<<< HEAD
import { emptyRichText, type KeyedQuestion } from '@scholis/schema';
=======
import { emptyRichText, type KeyedQuestion, type ShortGradingMode } from '@scholis/schema';
import type { ChoiceRubricTier } from '@scholis/schema';
>>>>>>> master

/** Test scaffolding. Excluded from coverage; see `packages/config/vitest.base.js`. */

type Correctness = boolean[];

export const choice = (
  id: string,
  correctness: Correctness,
  settings: {
    selection?: 'single' | 'multi';
    partialCredit?: boolean;
<<<<<<< HEAD
=======
    rubric?: ChoiceRubricTier[] | null;
>>>>>>> master
    points?: number;
  } = {},
): KeyedQuestion => ({
  id,
  type: 'choice',
  body: emptyRichText(),
  points: settings.points ?? 4,
  position: 0,
<<<<<<< HEAD
  settings: {
    selection: settings.selection ?? 'single',
    variant: 'plain',
    partialCredit: settings.partialCredit ?? false,
=======
  sectionId: null,
  settings: {
    selection: settings.selection ?? 'single',
    variant: 'plain',
    rubric: settings.rubric ?? null,
    ...(settings.partialCredit !== undefined ? { partialCredit: settings.partialCredit } : {}),
>>>>>>> master
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
<<<<<<< HEAD
  caseSensitive = false,
=======
  settings: { caseSensitive?: boolean; gradingMode?: ShortGradingMode } = {},
>>>>>>> master
  points = 2,
): KeyedQuestion => ({
  id,
  type: 'short',
  body: emptyRichText(),
  points,
  position: 0,
<<<<<<< HEAD
  settings: { caseSensitive },
=======
  sectionId: null,
  settings: {
    caseSensitive: settings.caseSensitive ?? false,
    ...(settings.gradingMode !== undefined ? { gradingMode: settings.gradingMode } : {}),
  },
>>>>>>> master
  acceptedAnswers,
});

export const essay = (id: string, points = 10): KeyedQuestion => ({
  id,
  type: 'essay',
  body: emptyRichText(),
  points,
  position: 0,
<<<<<<< HEAD
=======
  sectionId: null,
>>>>>>> master
  settings: { minWords: null, maxWords: null },
});
