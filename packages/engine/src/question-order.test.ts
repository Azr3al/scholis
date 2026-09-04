import type { TestPackage } from '@scholis/schema';
import { emptyRichText } from '@scholis/schema';
import { describe, expect, it } from 'vitest';
import {
  applyQuestionOrder,
  shuffleQuestionsWithinSections,
  type OrderableQuestion,
} from './question-order';

const q = (id: string, position: number, sectionId: string | null = null): OrderableQuestion => ({
  id,
  position,
  sectionId,
});

describe('shuffleQuestionsWithinSections', () => {
  it('returns empty for no questions', () => {
    expect(shuffleQuestionsWithinSections([], 'seed')).toEqual([]);
  });

  it('is deterministic for the same seed', () => {
    const questions = [q('a', 0, 's1'), q('b', 1, 's1'), q('c', 2, 's2'), q('d', 3, 's2')];
    const first = shuffleQuestionsWithinSections(questions, 'attempt-1');
    const second = shuffleQuestionsWithinSections(questions, 'attempt-1');
    expect(first).toEqual(second);
  });

  it('differs across seeds when enough questions exist', () => {
    const questions = [q('a', 0, null), q('b', 1, null), q('c', 2, null), q('d', 3, null)];
    const a = shuffleQuestionsWithinSections(questions, 'attempt-a');
    const b = shuffleQuestionsWithinSections(questions, 'attempt-b');
    expect(a).not.toEqual(b);
  });

  it('only shuffles within contiguous section runs', () => {
    const questions = [q('a', 0, 's1'), q('b', 1, 's1'), q('c', 2, 's2'), q('d', 3, 's2')];
    const order = shuffleQuestionsWithinSections(questions, 'fixed-seed');

    const index = (id: string) => order.indexOf(id);
    // Runs stay in canonical section sequence: s1 block before s2 block.
    expect(Math.max(index('a'), index('b'))).toBeLessThan(Math.min(index('c'), index('d')));
  });

  it('treats unsectioned questions as their own runs', () => {
    const questions = [q('a', 0, null), q('b', 1, 's1'), q('c', 2, null)];
    const order = shuffleQuestionsWithinSections(questions, 'seed');
    expect(order).toHaveLength(3);
    // Three runs: [a], [b], [c] — b stays between the two unsectioned blocks.
    expect(order.indexOf('b')).toBeGreaterThan(order.indexOf('a'));
    expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('b'));
  });

  it('breaks position ties by question id', () => {
    const order = shuffleQuestionsWithinSections([q('b', 0, null), q('a', 0, null)], 'seed');
    expect(order).toHaveLength(2);
  });
});

describe('applyQuestionOrder', () => {
  const pkg = (): TestPackage => ({
    testId: 't1',
    code: 'SCHOL-TEST',
    title: 'Test',
    timeLimitMinutes: null,
    allowNavigation: true,
    testTakingMode: false,
    introBody: emptyRichText(),
    outroBody: emptyRichText(),
    sections: [],
    questions: [
      {
        id: 'q1',
        type: 'short',
        body: emptyRichText(),
        points: 1,
        position: 0,
        sectionId: null,
        settings: { caseSensitive: false },
      },
      {
        id: 'q2',
        type: 'short',
        body: emptyRichText(),
        points: 1,
        position: 1,
        sectionId: null,
        settings: { caseSensitive: false },
      },
    ],
  });

  it('reorders questions to match stored order', () => {
    const reordered = applyQuestionOrder(pkg(), ['q2', 'q1']);
    expect(reordered.questions.map((q) => q.id)).toEqual(['q2', 'q1']);
  });

  it('throws when order length mismatches', () => {
    expect(() => applyQuestionOrder(pkg(), ['q1'])).toThrow(/length/);
  });

  it('throws on unknown question id', () => {
    expect(() => applyQuestionOrder(pkg(), ['q1', 'missing'])).toThrow(/Unknown question id/);
  });

  it('returns the package unchanged for an empty order', () => {
    const original = pkg();
    expect(applyQuestionOrder(original, [])).toBe(original);
  });
});
