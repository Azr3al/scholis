import { describe, expect, it } from 'vitest';
import {
  buildAllOrNothingRubric,
  buildEvenSplitRubric,
  choiceRubricTierSchema,
  validateChoiceRubric,
} from './choice-rubric';
import type { ChoiceSettings } from './question';

describe('choice rubric helpers', () => {
  it('parses rubric tiers', () => {
    expect(choiceRubricTierSchema.parse({ correctCount: 1, points: 0.5 })).toEqual({
      correctCount: 1,
      points: 0.5,
    });
  });

  it('builds an even-split rubric', () => {
    expect(buildEvenSplitRubric(2, 1)).toEqual([
      { correctCount: 0, points: 0 },
      { correctCount: 1, points: 0.5 },
      { correctCount: 2, points: 1 },
    ]);
  });

  it('builds an all-or-nothing rubric', () => {
    expect(buildAllOrNothingRubric(2, 4)).toEqual([
      { correctCount: 0, points: 0 },
      { correctCount: 1, points: 0 },
      { correctCount: 2, points: 4 },
    ]);
  });

  it('accepts a valid rubric', () => {
    const settings: ChoiceSettings = {
      selection: 'multi',
      variant: 'plain',
      rubric: buildEvenSplitRubric(2, 2),
    };
    expect(validateChoiceRubric(settings, 2, 2)).toBeNull();
  });

  it('rejects a rubric whose top tier is below full marks', () => {
    const settings: ChoiceSettings = {
      selection: 'multi',
      variant: 'plain',
      rubric: [
        { correctCount: 0, points: 0 },
        { correctCount: 1, points: 0.5 },
        { correctCount: 2, points: 1.5 },
      ],
    };
    expect(validateChoiceRubric(settings, 2, 2)).toMatch(/full question marks/);
  });
});
