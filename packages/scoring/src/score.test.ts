import { textToRichText, ShortGradingMode } from '@scholis/schema';
import { describe, expect, it } from 'vitest';
import { choice, essay, short } from './fixtures';
import { clamp, round4 } from './round';
import { score } from './score';

describe('round4 / clamp', () => {
  it('rounds to four decimal places', () => {
    expect(round4(0.1 + 0.2)).toBe(0.3);
    expect(round4(1 / 3)).toBe(0.3333);
  });

  it('clamps into range', () => {
    expect(clamp(-5, 10)).toBe(0);
    expect(clamp(15, 10)).toBe(10);
    expect(clamp(5, 10)).toBe(5);
  });
});

describe('score', () => {
  it('marks an empty test', () => {
    expect(score({ questions: [], responses: {}, manualMarks: {} })).toEqual({
      questionScores: [],
      score: 0,
      maxScore: 0,
      requiresManualMarking: false,
    });
  });

  it('totals across mixed question types', () => {
    const report = score({
      questions: [choice('q1', [true, false]), short('q2', ['Paris'])],
      responses: {
        q1: { kind: 'choice', optionIds: ['q1-0'] },
        q2: { kind: 'short', doc: textToRichText('paris') },
      },
      manualMarks: {},
    });

    expect(report.score).toBe(6);
    expect(report.maxScore).toBe(6);
    expect(report.requiresManualMarking).toBe(false);
  });

  it('counts unanswered questions towards maxScore but not score', () => {
    const report = score({
      questions: [choice('q1', [true, false]), short('q2', ['Paris'])],
      responses: {},
      manualMarks: {},
    });
    expect(report.score).toBe(0);
    expect(report.maxScore).toBe(6);
  });

  it('marks an unmarked essay as pending rather than zero', () => {
    // The distinction gates release: a teacher must not accidentally publish an
    // unmarked essay as a zero the student then sees.
    const report = score({ questions: [essay('e1')], responses: {}, manualMarks: {} });

    expect(report.questionScores[0]).toEqual({
      questionId: 'e1',
      awarded: 0,
      maxPoints: 10,
      status: 'pending_manual',
    });
    expect(report.requiresManualMarking).toBe(true);
  });

  it('uses the human mark once an essay is graded', () => {
    const report = score({ questions: [essay('e1')], responses: {}, manualMarks: { e1: 7 } });

    expect(report.questionScores[0]).toMatchObject({ awarded: 7, status: 'manual' });
    expect(report.requiresManualMarking).toBe(false);
    expect(report.score).toBe(7);
  });

  it('distinguishes a deliberate zero from an absent mark', () => {
    const report = score({ questions: [essay('e1')], responses: {}, manualMarks: { e1: 0 } });
    expect(report.questionScores[0]).toMatchObject({ awarded: 0, status: 'manual' });
    expect(report.requiresManualMarking).toBe(false);
  });

  it('clamps a manual mark outside the question total', () => {
    const over = score({ questions: [essay('e1')], responses: {}, manualMarks: { e1: 99 } });
    expect(over.questionScores[0]?.awarded).toBe(10);

    const under = score({ questions: [essay('e1')], responses: {}, manualMarks: { e1: -3 } });
    expect(under.questionScores[0]?.awarded).toBe(0);
  });

  it('still reports pending when only some essays are marked', () => {
    const report = score({
      questions: [essay('e1'), essay('e2')],
      responses: {},
      manualMarks: { e1: 5 },
    });
    expect(report.requiresManualMarking).toBe(true);
    expect(report.score).toBe(5);
  });

  it('rounds the total, not just the parts', () => {
    const thirds = choice('t', [true, true, true], {
      selection: 'multi',
      partialCredit: true,
      points: 1,
    });
    const report = score({
      questions: [thirds],
      responses: { t: { kind: 'choice', optionIds: ['t-0'] } },
      manualMarks: {},
    });
    expect(report.score).toBe(0.3333);
  });

  it('preserves question order in the report', () => {
    const report = score({
      questions: [choice('q1', [true]), essay('e1'), short('q2', ['x'])],
      responses: {},
      manualMarks: {},
    });
    expect(report.questionScores.map((q) => q.questionId)).toEqual(['q1', 'e1', 'q2']);
  });

  it('marks an unmarked manual short as pending rather than zero', () => {
    const report = score({
      questions: [short('s1', [], { gradingMode: ShortGradingMode.Manual })],
      responses: {},
      manualMarks: {},
    });

    expect(report.questionScores[0]).toEqual({
      questionId: 's1',
      awarded: 0,
      maxPoints: 2,
      status: 'pending_manual',
    });
    expect(report.requiresManualMarking).toBe(true);
  });

  it('uses the human mark once a manual short is graded', () => {
    const report = score({
      questions: [short('s1', [], { gradingMode: ShortGradingMode.Manual }, 3)],
      responses: {},
      manualMarks: { s1: 2 },
    });

    expect(report.questionScores[0]).toMatchObject({ awarded: 2, status: 'manual' });
    expect(report.requiresManualMarking).toBe(false);
  });

  it('auto-grades rubric short answers regardless of acceptedAnswers when legacy', () => {
    const report = score({
      questions: [short('s1', ['Paris'])],
      responses: { s1: { kind: 'short', doc: textToRichText('paris') } },
      manualMarks: {},
    });

    expect(report.questionScores[0]).toMatchObject({ awarded: 2, status: 'auto' });
    expect(report.requiresManualMarking).toBe(false);
  });

  it('blocks release when essay and manual short both need marking', () => {
    const report = score({
      questions: [essay('e1'), short('s1', [], { gradingMode: ShortGradingMode.Manual })],
      responses: {},
      manualMarks: { e1: 5 },
    });
    expect(report.requiresManualMarking).toBe(true);
  });
});
