import { describe, expect, it } from 'vitest';
import {
  keyedChoiceQuestionSchema,
  keyedShortQuestionSchema,
  publicQuestionSchema,
} from './question';
import { emptyRichText } from './rich-text';
import { testPackageSchema } from './test-package';

const body = emptyRichText();

const keyedChoice = {
  id: 'q1',
  type: 'choice' as const,
  body,
  points: 2,
  position: 0,
<<<<<<< HEAD
  settings: { selection: 'single' as const, variant: 'boolean' as const, partialCredit: false },
=======
  settings: { selection: 'single' as const, variant: 'boolean' as const, rubric: null },
>>>>>>> master
  options: [
    { id: 'true', body, isCorrect: true },
    { id: 'false', body, isCorrect: false },
  ],
};

const keyedShort = {
  id: 'q2',
  type: 'short' as const,
  body,
  points: 1,
  position: 1,
  settings: { caseSensitive: false },
  acceptedAnswers: ['photosynthesis'],
};

describe('keyed question shapes', () => {
  it('accepts a keyed choice question', () => {
    expect(keyedChoiceQuestionSchema.parse(keyedChoice).options[0]?.isCorrect).toBe(true);
  });

  it('accepts a keyed short question', () => {
    expect(keyedShortQuestionSchema.parse(keyedShort).acceptedAnswers).toEqual(['photosynthesis']);
  });
<<<<<<< HEAD
=======

  it('accepts a draft short question with no accepted answers yet', () => {
    expect(
      keyedShortQuestionSchema.parse({ ...keyedShort, acceptedAnswers: [] }).acceptedAnswers,
    ).toEqual([]);
  });
>>>>>>> master
});

/**
 * These are the specs that protect the product's credibility. If the public
 * schema ever stops stripping keys, answer keys reach the student's browser and
 * every exam run on Scholis is void.
 */
describe('public schema strips answer keys', () => {
  it('removes isCorrect from nested choice options', () => {
    const parsed = publicQuestionSchema.parse(keyedChoice);
    expect(parsed).not.toHaveProperty('options.0.isCorrect');
    for (const option of (parsed as { options: unknown[] }).options) {
      expect(option).not.toHaveProperty('isCorrect');
    }
  });

  it('removes acceptedAnswers from short questions', () => {
    expect(publicQuestionSchema.parse(keyedShort)).not.toHaveProperty('acceptedAnswers');
  });

  it('leaves everything a student legitimately needs', () => {
    const parsed = publicQuestionSchema.parse(keyedChoice);
    expect(parsed).toMatchObject({ id: 'q1', type: 'choice', points: 2, position: 0 });
    expect((parsed as { options: unknown[] }).options).toHaveLength(2);
  });

  it('strips keys through a whole test package, at every depth', () => {
    const pkg = testPackageSchema.parse({
      testId: 't1',
      code: 'SCHOL-4F2K',
      title: 'Photosynthesis',
      timeLimitMinutes: 30,
      allowNavigation: true,
      introBody: body,
      outroBody: body,
      questions: [keyedChoice, keyedShort],
    });

    // The real assertion is on the serialised payload, because that is what
    // actually crosses the wire — a key hiding on a non-enumerable property or
    // deep in a nested array would still show up here.
    const wire = JSON.stringify(pkg);
    expect(wire).not.toContain('isCorrect');
    expect(wire).not.toContain('acceptedAnswers');
    expect(wire).not.toContain('photosynthesis');
  });
});
