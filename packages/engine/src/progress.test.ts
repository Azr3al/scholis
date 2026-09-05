import { textToRichText } from '@scholis/schema';
import { describe, expect, it } from 'vitest';
import {
  attemptState,
  choiceQuestion,
  essayQuestion,
  shortQuestion,
  testPackage,
} from './fixtures';
import { progress } from './progress';

const pkg = testPackage([choiceQuestion('q1'), shortQuestion('q2'), essayQuestion('q3')]);

describe('progress', () => {
  it('reports nothing answered on a fresh attempt', () => {
    expect(progress(pkg, attemptState())).toEqual({
      answered: 0,
      total: 3,
      unanswered: ['q1', 'q2', 'q3'],
      markedForReview: 0,
      settled: 0,
    });
  });

  it('counts answered questions', () => {
    const state = attemptState({
      responses: {
        q1: { kind: 'choice', optionIds: ['q1-a'] },
        q2: { kind: 'short', doc: textToRichText('answer') },
      },
    });
    expect(progress(pkg, state)).toMatchObject({ answered: 2, unanswered: ['q3'] });
  });

  it('treats present-but-empty responses as unanswered', () => {
    // The bug this prevents: reporting 3/3 to a student who typed nothing,
    // because a row exists for every question they visited.
    const state = attemptState({
      responses: {
        q1: { kind: 'choice', optionIds: [] },
        q2: { kind: 'short', doc: textToRichText('   ') },
        q3: { kind: 'essay', doc: { type: 'doc', content: [] } },
      },
    });
    expect(progress(pkg, state)).toMatchObject({ answered: 0, unanswered: ['q1', 'q2', 'q3'] });
  });

  it('returns unanswered ids in test order, not response order', () => {
    const state = attemptState({ responses: { q2: { kind: 'short', doc: textToRichText('x') } } });
    expect(progress(pkg, state).unanswered).toEqual(['q1', 'q3']);
  });

  it('surfaces the marked-for-review count', () => {
    expect(progress(pkg, attemptState({ markedForReview: ['q1', 'q3'] })).markedForReview).toBe(2);
  });

  it('handles a test with no questions', () => {
    expect(progress(testPackage([]), attemptState())).toEqual({
      answered: 0,
      total: 0,
      unanswered: [],
      markedForReview: 0,
      settled: 0,
    });
  });
});

/**
 * What the take screen actually shows.
 *
 * `answered` moves on the first keystroke, which made the counter twitch while
 * a student was still typing. `settled` holds still until they move on.
 */
describe('progress.settled', () => {
  it('does not count the question being answered right now', () => {
    // Sitting on q1 with q1 answered: honestly 1, but not yet finished with.
    const state = attemptState({
      cursor: 0,
      responses: { q1: { kind: 'choice', optionIds: ['q1-a'] } },
    });
    expect(progress(pkg, state)).toMatchObject({ answered: 1, settled: 0 });
  });

  it('counts it once the taker has moved on', () => {
    const state = attemptState({
      cursor: 1,
      responses: { q1: { kind: 'choice', optionIds: ['q1-a'] } },
    });
    expect(progress(pkg, state)).toMatchObject({ answered: 1, settled: 1 });
  });

  it('counts the last question immediately, since there is nowhere to move on to', () => {
    // Otherwise a fully answered paper would read 2 of 3 right up to hand-in.
    const state = attemptState({
      cursor: 2,
      responses: {
        q1: { kind: 'choice', optionIds: ['q1-a'] },
        q2: { kind: 'short', doc: textToRichText('answer') },
        q3: { kind: 'essay', doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
      },
    });
    expect(progress(pkg, state)).toMatchObject({ answered: 3, settled: 3 });
  });

  it('still ignores an empty answer on the question in hand', () => {
    const state = attemptState({ cursor: 1, responses: { q2: { kind: 'short', doc: textToRichText('  ') } } });
    expect(progress(pkg, state)).toMatchObject({ answered: 0, settled: 0 });
  });

  it('drops back by one when the taker returns to an answered question', () => {
    // The known consequence of the rule, asserted rather than discovered: q1 is
    // the question in hand again, so it stops counting until they leave.
    const answers = {
      q1: { kind: 'choice' as const, optionIds: ['q1-a'] },
      q2: { kind: 'short' as const, doc: textToRichText('answer') },
    };
    expect(progress(pkg, attemptState({ cursor: 2, responses: answers })).settled).toBe(2);
    expect(progress(pkg, attemptState({ cursor: 0, responses: answers })).settled).toBe(1);
  });
});
