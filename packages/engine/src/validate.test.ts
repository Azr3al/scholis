<<<<<<< HEAD
=======
import { textToRichText } from '@scholis/schema';
>>>>>>> master
import { describe, expect, it } from 'vitest';
import { attemptState, choiceQuestion, essayQuestion, richText, testPackage } from './fixtures';
import { countWords, validate } from './validate';

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   \n\t ', 0],
    ['one', 1],
    ['two words', 2],
    ['  padded   words  ', 2],
    ['line\nbreaks\tand   spaces', 4],
  ])('counts %j as %i', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});

describe('validate', () => {
  it('flags unanswered questions', () => {
    const pkg = testPackage([choiceQuestion('q1')]);
    expect(validate(pkg, attemptState())).toEqual([{ code: 'unanswered', questionId: 'q1' }]);
  });

  it('returns nothing when everything is answered and within limits', () => {
    const pkg = testPackage([choiceQuestion('q1')]);
    const state = attemptState({ responses: { q1: { kind: 'choice', optionIds: ['q1-a'] } } });
    expect(validate(pkg, state)).toEqual([]);
  });

  it('flags an essay under its minimum', () => {
    const pkg = testPackage([essayQuestion('q1', { minWords: 5, maxWords: null })]);
    const state = attemptState({
      responses: { q1: { kind: 'essay', doc: richText('too short') } },
    });
    expect(validate(pkg, state)).toEqual([
      { code: 'essay_too_short', questionId: 'q1', words: 2, limit: 5 },
    ]);
  });

  it('flags an essay over its maximum', () => {
    const pkg = testPackage([essayQuestion('q1', { minWords: null, maxWords: 2 })]);
    const state = attemptState({
      responses: { q1: { kind: 'essay', doc: richText('one two three') } },
    });
    expect(validate(pkg, state)).toEqual([
      { code: 'essay_too_long', questionId: 'q1', words: 3, limit: 2 },
    ]);
  });

  it('accepts an essay exactly on both bounds', () => {
    const pkg = testPackage([essayQuestion('q1', { minWords: 2, maxWords: 2 })]);
    const state = attemptState({
      responses: { q1: { kind: 'essay', doc: richText('two words') } },
    });
    expect(validate(pkg, state)).toEqual([]);
  });

  it('ignores word limits on non-essay questions', () => {
    const pkg = testPackage([choiceQuestion('q1')]);
    const state = attemptState({ responses: { q1: { kind: 'choice', optionIds: ['q1-a'] } } });
    expect(validate(pkg, state)).toEqual([]);
  });

  it('does not report word limits for an unanswered essay', () => {
    // Reporting both "unanswered" and "too short" for the same empty box is
    // noise; the taker only needs to be told once.
    const pkg = testPackage([essayQuestion('q1', { minWords: 10, maxWords: null })]);
    expect(validate(pkg, attemptState())).toEqual([{ code: 'unanswered', questionId: 'q1' }]);
  });

  it('skips an essay question answered with a mismatched response kind', () => {
    const pkg = testPackage([essayQuestion('q1', { minWords: 10, maxWords: null })]);
<<<<<<< HEAD
    const state = attemptState({ responses: { q1: { kind: 'short', text: 'wrong kind' } } });
=======
    const state = attemptState({ responses: { q1: { kind: 'short', doc: textToRichText('wrong kind') } } });
>>>>>>> master
    expect(validate(pkg, state)).toEqual([]);
  });
});
