import type { KeyedQuestion, ResponseValue } from '@scholis/schema';
<<<<<<< HEAD
=======
import { textToRichText } from '@scholis/schema';
>>>>>>> master
import { describe, expect, it } from 'vitest';
import { short } from './fixtures';
import { normalizeShortAnswer, scoreShort } from './score-short';

type KeyedShort = Extract<KeyedQuestion, { type: 'short' }>;

<<<<<<< HEAD
const text = (value: string): ResponseValue => ({ kind: 'short', text: value });
=======
const text = (value: string): ResponseValue => ({ kind: 'short', doc: textToRichText(value) });
>>>>>>> master
const q = (...args: Parameters<typeof short>) => short(...args) as KeyedShort;

describe('normalizeShortAnswer', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeShortAnswer('  answer  ', true)).toBe('answer');
  });

  it('collapses internal whitespace', () => {
    // A student who double-taps space should not lose a mark.
    expect(normalizeShortAnswer('New   York', true)).toBe('New York');
    expect(normalizeShortAnswer('a\n\tb', true)).toBe('a b');
  });

  it('lowercases only when case-insensitive', () => {
    expect(normalizeShortAnswer('Paris', false)).toBe('paris');
    expect(normalizeShortAnswer('Paris', true)).toBe('Paris');
  });
});

describe('scoreShort', () => {
  it('awards full points for an exact match', () => {
    expect(scoreShort(q('q', ['photosynthesis']), text('photosynthesis'))).toBe(2);
  });

  it('accepts any of several keyed answers', () => {
    const question = q('q', ['UK', 'United Kingdom', 'Britain']);
    expect(scoreShort(question, text('Britain'))).toBe(2);
    expect(scoreShort(question, text('United Kingdom'))).toBe(2);
  });

  it('ignores case by default', () => {
    expect(scoreShort(q('q', ['Paris']), text('paris'))).toBe(2);
  });

  it('respects case sensitivity when the teacher asks for it', () => {
<<<<<<< HEAD
    const question = q('q', ['NaCl'], true);
=======
    const question = q('q', ['NaCl'], { caseSensitive: true });
>>>>>>> master
    expect(scoreShort(question, text('NaCl'))).toBe(2);
    expect(scoreShort(question, text('nacl'))).toBe(0);
  });

  it('normalises the keyed answer too, not just the response', () => {
    // A teacher who pastes "  Paris " should not create an unmatchable key.
    expect(scoreShort(q('q', ['  Paris ']), text('Paris'))).toBe(2);
  });

  it('awards nothing for a wrong answer', () => {
    expect(scoreShort(q('q', ['Paris']), text('London'))).toBe(0);
  });

  it('awards nothing for an empty or whitespace-only answer', () => {
    expect(scoreShort(q('q', ['Paris']), text(''))).toBe(0);
    expect(scoreShort(q('q', ['Paris']), text('   \t '))).toBe(0);
  });

  it('scores zero for a missing response', () => {
    expect(scoreShort(q('q', ['Paris']), undefined)).toBe(0);
  });

  it('scores zero for a response of the wrong kind', () => {
    expect(scoreShort(q('q', ['Paris']), { kind: 'choice', optionIds: ['Paris'] })).toBe(0);
  });
});
