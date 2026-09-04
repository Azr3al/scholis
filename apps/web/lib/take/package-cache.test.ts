import { describe, expect, it } from 'vitest';
import { makeCachedPackage, readCachedPackage } from './package-cache';

const NOW = new Date('2026-08-09T10:00:00.000Z');
const text = (s: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: s }] }],
});

/**
 * The reason this store is allowed to exist.
 *
 * `/api/*` is never cached by the service worker precisely because a cache
 * cannot tell a question from a grade. This store is the exception, and it is
 * only defensible while the thing it holds provably carries no answer keys —
 * so that property is asserted here rather than assumed from the fact that the
 * server strips them on the way out.
 */
describe('the cached package cannot carry answer keys', () => {
  // Shaped like a database row rather than an API response: keys present at
  // every depth they could appear.
  const keyed = {
    version: 1,
    code: 'SCHOL-ABC123',
    savedAt: NOW.toISOString(),
    pkg: {
      testId: 't1',
      code: 'SCHOL-ABC123',
      title: 'Geography',
      timeLimitMinutes: null,
      allowNavigation: true,
      testTakingMode: false,
      introBody: text(''),
      outroBody: text(''),
      sections: [],
      questions: [
        {
          id: 'q1',
          type: 'choice',
          body: text('Capital of France?'),
          points: 1,
          position: 0,
          settings: { selection: 'single', variant: 'plain', partialCredit: false },
          options: [
            { id: 'o1', body: text('Paris'), isCorrect: true },
            { id: 'o2', body: text('Berlin'), isCorrect: false },
          ],
        },
        {
          id: 'q2',
          type: 'short',
          body: text('Largest ocean?'),
          points: 1,
          position: 1,
          settings: { caseSensitive: false, trimWhitespace: true },
          acceptedAnswers: ['Pacific'],
        },
      ],
    },
  };

  it('strips isCorrect from every option', () => {
    const read = readCachedPackage(keyed, 'SCHOL-ABC123');
    expect(read).not.toBeNull();

    const question = read?.pkg.questions[0];
    expect(question?.type).toBe('choice');
    if (question?.type !== 'choice') throw new Error('expected a choice question');

    expect(question.options).toHaveLength(2);
    for (const option of question.options) {
      expect(option).not.toHaveProperty('isCorrect');
    }
  });

  it('strips acceptedAnswers from short questions', () => {
    const read = readCachedPackage(keyed, 'SCHOL-ABC123');
    expect(read?.pkg.questions[1]).not.toHaveProperty('acceptedAnswers');
  });

  it('leaves nothing key-shaped anywhere in the parsed result, at any depth', () => {
    const read = readCachedPackage(keyed, 'SCHOL-ABC123');
    const serialised = JSON.stringify(read);

    // The blunt version of the two assertions above, and the one that would
    // catch a key arriving under a name nobody thought to check for.
    expect(serialised).not.toContain('isCorrect');
    expect(serialised).not.toContain('acceptedAnswers');
    expect(serialised).not.toContain('Pacific');
  });
});

describe('readCachedPackage rejects what it should', () => {
  const valid = makeCachedPackage(
    'SCHOL-ABC123',
    {
      testId: 't1',
      code: 'SCHOL-ABC123',
      title: 'Geography',
      timeLimitMinutes: null,
      allowNavigation: true,
      testTakingMode: false,
      introBody: text(''),
      outroBody: text(''),
      sections: [],
      questions: [],
    },
    NOW,
  );

  it('round-trips through JSON, which is what IndexedDB stores', () => {
    const back = readCachedPackage(JSON.parse(JSON.stringify(valid)), 'SCHOL-ABC123');
    expect(back?.pkg.title).toBe('Geography');
  });

  it('refuses a package stored under a different code', () => {
    // Showing one test's questions under another's code would be worse than
    // showing nothing at all.
    expect(readCachedPackage(valid, 'SCHOL-OTHER')).toBeNull();
  });

  it('refuses an unknown version', () => {
    expect(readCachedPackage({ ...valid, version: 2 }, 'SCHOL-ABC123')).toBeNull();
  });

  it('refuses a half-written record', () => {
    expect(readCachedPackage({ version: 1, code: 'SCHOL-ABC123' }, 'SCHOL-ABC123')).toBeNull();
  });

  it('refuses nothing at all', () => {
    expect(readCachedPackage(null, 'SCHOL-ABC123')).toBeNull();
    expect(readCachedPackage(undefined, 'SCHOL-ABC123')).toBeNull();
  });
});
