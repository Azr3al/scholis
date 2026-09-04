import { z } from 'zod';
import type { ChoiceSettings } from './question';

export const choiceRubricTierSchema = z.object({
  correctCount: z.number().int().nonnegative(),
  points: z.number().min(0),
});
export type ChoiceRubricTier = z.infer<typeof choiceRubricTierSchema>;

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/** Even split: `count / N × maxPoints` for each tier 0…N. */
export const buildEvenSplitRubric = (
  correctCount: number,
  maxPoints: number,
): ChoiceRubricTier[] =>
  Array.from({ length: correctCount + 1 }, (_, correctCountIndex) => ({
    correctCount: correctCountIndex,
    points: round4(maxPoints * (correctCountIndex / correctCount)),
  }));

/** All or nothing: full marks only when every correct option is selected. */
export const buildAllOrNothingRubric = (
  correctCount: number,
  maxPoints: number,
): ChoiceRubricTier[] =>
  Array.from({ length: correctCount + 1 }, (_, correctCountIndex) => ({
    correctCount: correctCountIndex,
    points: correctCountIndex === correctCount ? maxPoints : 0,
  }));

/**
 * Effective rubric for scoring. Uses explicit `rubric` when set; otherwise
 * derives from legacy `partialCredit` for stored questions not yet migrated.
 */
export const resolveChoiceRubric = (
  settings: ChoiceSettings,
  correctCount: number,
  maxPoints: number,
): ChoiceRubricTier[] | null => {
  if (settings.selection !== 'multi' || correctCount < 2) return null;

  if (settings.rubric !== null && settings.rubric.length > 0) {
    return settings.rubric;
  }

  if (settings.partialCredit === true) {
    return buildEvenSplitRubric(correctCount, maxPoints);
  }

  return buildAllOrNothingRubric(correctCount, maxPoints);
};

export const validateChoiceRubric = (
  settings: ChoiceSettings,
  correctCount: number,
  maxPoints: number,
): string | null => {
  if (settings.selection !== 'multi' || correctCount < 2) return null;

  const rubric = settings.rubric;
  if (rubric === null || rubric.length === 0) {
    return 'Add a scoring rubric for this multi-answer question.';
  }

  if (rubric.length !== correctCount + 1) {
    return 'The rubric must cover every count from 0 to the number of correct answers.';
  }

  for (let index = 0; index < rubric.length; index += 1) {
    const tier = rubric[index];
    if (tier?.correctCount !== index) {
      return 'Rubric tiers must be ordered from 0 correct through full marks.';
    }
    if (tier.points > maxPoints) {
      return 'Rubric marks cannot exceed the question total.';
    }
    if (index > 0) {
      const previous = rubric[index - 1];
      if (previous !== undefined && tier.points < previous.points) {
        return 'Rubric marks must not decrease as more correct answers are selected.';
      }
    }
  }

  const top = rubric[correctCount];
  if (top?.points !== maxPoints) {
    return 'The top rubric tier must award the full question marks.';
  }

  return null;
};

export const assertValidChoiceRubric = (
  settings: ChoiceSettings,
  correctCount: number,
  maxPoints: number,
): void => {
  const message = validateChoiceRubric(settings, correctCount, maxPoints);
  if (message !== null) {
    throw new Error(message);
  }
};
