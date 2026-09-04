import { emptyRichText, textToRichText } from '@scholis/schema';
import { describe, expect, it } from 'vitest';
import {
  incompleteQuestionCount,
  isQuestionReady,
  listQuestionReadinessIssues,
  type ReadinessQuestion,
} from './question-readiness';

const text = (value: string) => textToRichText(value);

const base = (overrides: Partial<ReadinessQuestion> & Pick<ReadinessQuestion, 'type'>): ReadinessQuestion => ({
  id: 'q1',
  body: text('Prompt'),
  points: 1,
  settings: {},
  ...overrides,
});

describe('question readiness', () => {
  it('flags empty prompt and missing short accepted answers for rubric mode', () => {
    const short = base({
      type: 'short',
      body: emptyRichText(),
      settings: { gradingMode: 'rubric' as const, caseSensitive: false },
      acceptedAnswers: [],
    });

    const issues = listQuestionReadinessIssues([short]);
    expect(issues.map((i) => i.code)).toContain('missing_prompt');
    expect(issues.map((i) => i.code)).toContain('missing_accepted');
    expect(isQuestionReady(short)).toBe(false);
  });

  it('does not require accepted answers for manual short questions', () => {
    const manual = base({
      type: 'short',
      settings: { gradingMode: 'manual' as const, caseSensitive: false },
      acceptedAnswers: [],
    });
    expect(listQuestionReadinessIssues([manual]).map((i) => i.code)).not.toContain(
      'missing_accepted',
    );
    expect(isQuestionReady(manual)).toBe(true);
  });

  it('legacy short without gradingMode still requires accepted answers', () => {
    const legacy = base({ type: 'short', settings: { caseSensitive: false }, acceptedAnswers: [] });
    expect(listQuestionReadinessIssues([legacy]).map((i) => i.code)).toContain('missing_accepted');
  });

  it('requires two filled choice options and a correct key', () => {
    const incomplete = base({
      type: 'choice',
      settings: { selection: 'single' },
      options: [
        { body: text('A'), isCorrect: false },
        { body: emptyRichText(), isCorrect: false },
      ],
    });

    expect(listQuestionReadinessIssues([incomplete]).map((i) => i.code)).toContain('missing_options');

    const noCorrect = base({
      type: 'choice',
      settings: { selection: 'single' },
      options: [
        { body: text('A'), isCorrect: false },
        { body: text('B'), isCorrect: false },
      ],
    });
    expect(listQuestionReadinessIssues([noCorrect]).map((i) => i.code)).toContain('missing_correct');
  });

  it('passes a complete single-choice question', () => {
    const ready = base({
      type: 'choice',
      settings: { selection: 'single' },
      options: [
        { body: text('A'), isCorrect: true },
        { body: text('B'), isCorrect: false },
      ],
    });
    expect(isQuestionReady(ready)).toBe(true);
  });

  it('counts distinct incomplete questions', () => {
    const questions: ReadinessQuestion[] = [
      base({ id: 'q1', type: 'essay', body: emptyRichText() }),
      base({ id: 'q2', type: 'essay', body: emptyRichText() }),
      base({ id: 'q3', type: 'essay' }),
    ];
    expect(incompleteQuestionCount(questions)).toBe(2);
  });

  it('flags invalid points', () => {
    const bad = base({ type: 'essay', points: 0 });
    expect(listQuestionReadinessIssues([bad]).map((i) => i.code)).toContain('invalid_points');
  });

  it('handles missing optional fields on draft shapes', () => {
    const choice = base({
      type: 'choice',
      settings: { selection: 'multi' },
      options: undefined,
    });
    const short = base({ type: 'short', acceptedAnswers: undefined });

    expect(listQuestionReadinessIssues([choice]).map((i) => i.code)).toContain('missing_options');
    expect(listQuestionReadinessIssues([short]).map((i) => i.code)).toContain('missing_accepted');
  });

  it('ignores unknown choice selection settings', () => {
    const multiLike = base({
      type: 'choice',
      settings: { selection: 'bogus' },
      options: [
        { body: text('A'), isCorrect: true },
        { body: text('B'), isCorrect: true },
      ],
    });
    expect(listQuestionReadinessIssues([multiLike]).map((i) => i.code)).not.toContain(
      'single_correct',
    );
  });

  it('treats missing selection metadata as non-single', () => {
    const choice = base({
      type: 'choice',
      settings: {},
      options: [
        { body: text('A'), isCorrect: true },
        { body: text('B'), isCorrect: true },
      ],
    });
    expect(listQuestionReadinessIssues([choice]).map((i) => i.code)).not.toContain('single_correct');
  });
});
