import type { ResponseValue } from '@scholis/schema';
import { describe, expect, it } from 'vitest';
import {
  attemptState,
  choiceQuestion,
  ctx,
  essayQuestion,
  MUTATION_ID,
  shortQuestion,
  testPackage,
} from './fixtures';
import { reduce } from './reduce';

const pkg = testPackage([choiceQuestion('q1'), shortQuestion('q2'), essayQuestion('q3')]);
const choiceAnswer: ResponseValue = { kind: 'choice', optionIds: ['q1-a'] };

describe('reduce › answer', () => {
  it('records the response and emits one mutation', () => {
    const result = reduce(
      pkg,
      attemptState(),
      { t: 'answer', questionId: 'q1', value: choiceAnswer },
      ctx(),
    );

    expect(result.rejected).toBeNull();
    expect(result.state.responses.q1).toEqual(choiceAnswer);
    expect(result.mutations).toEqual([
      {
        kind: 'answer',
        id: MUTATION_ID,
        attemptId: 'a1',
        questionId: 'q1',
        value: choiceAnswer,
        clientSeq: 1,
        at: '2026-08-07T10:05:00.000Z',
      },
    ]);
  });

  it('increments clientSeq so the server can order writes', () => {
    const first = reduce(
      pkg,
      attemptState({ clientSeq: 7 }),
      { t: 'answer', questionId: 'q1', value: choiceAnswer },
      ctx(),
    );
    expect(first.state.clientSeq).toBe(8);
    expect(first.mutations[0]?.clientSeq).toBe(8);
  });

  it('overwrites a previous answer to the same question', () => {
    const state = attemptState({ responses: { q1: { kind: 'choice', optionIds: ['q1-b'] } } });
    const result = reduce(
      pkg,
      state,
      { t: 'answer', questionId: 'q1', value: choiceAnswer },
      ctx(),
    );
    expect(result.state.responses.q1).toEqual(choiceAnswer);
  });

  it('does not mutate the state it was given', () => {
    const state = attemptState();
    reduce(pkg, state, { t: 'answer', questionId: 'q1', value: choiceAnswer }, ctx());
    expect(state.responses).toEqual({});
    expect(state.clientSeq).toBe(0);
  });

  it('rejects an unknown question', () => {
    const result = reduce(
      pkg,
      attemptState(),
      { t: 'answer', questionId: 'nope', value: choiceAnswer },
      ctx(),
    );
    expect(result.rejected).toBe('unknown_question');
    expect(result.mutations).toEqual([]);
  });

  it('rejects a response whose kind does not match the question type', () => {
    const result = reduce(
      pkg,
      attemptState(),
      { t: 'answer', questionId: 'q2', value: choiceAnswer },
      ctx(),
    );
    expect(result.rejected).toBe('response_kind_mismatch');
  });

  it('rejects answers after the deadline', () => {
    const result = reduce(
      pkg,
      attemptState(),
      { t: 'answer', questionId: 'q1', value: choiceAnswer },
      ctx('2026-08-07T10:31:00.000Z'),
    );
    expect(result.rejected).toBe('deadline_passed');
  });

  it('allows answers when the test is untimed', () => {
    const result = reduce(
      pkg,
      attemptState({ deadlineAt: null }),
      { t: 'answer', questionId: 'q1', value: choiceAnswer },
      ctx('2030-01-01T00:00:00.000Z'),
    );
    expect(result.rejected).toBeNull();
  });
});

describe('reduce › mark', () => {
  it('adds a question to the review list', () => {
    const result = reduce(pkg, attemptState(), { t: 'mark', questionId: 'q1', on: true }, ctx());
    expect(result.state.markedForReview).toEqual(['q1']);
    expect(result.mutations[0]).toMatchObject({ kind: 'mark', marked: true, clientSeq: 1 });
  });

  it('removes a question from the review list', () => {
    const state = attemptState({ markedForReview: ['q1', 'q2'] });
    const result = reduce(pkg, state, { t: 'mark', questionId: 'q1', on: false }, ctx());
    expect(result.state.markedForReview).toEqual(['q2']);
  });

  it('is a no-op when the mark is already in the requested state', () => {
    const state = attemptState({ markedForReview: ['q1'] });
    const result = reduce(pkg, state, { t: 'mark', questionId: 'q1', on: true }, ctx());
    expect(result.rejected).toBeNull();
    expect(result.mutations).toEqual([]);
    expect(result.state.clientSeq).toBe(0);
  });

  it('rejects marking an unknown question', () => {
    const result = reduce(pkg, attemptState(), { t: 'mark', questionId: 'nope', on: true }, ctx());
    expect(result.rejected).toBe('unknown_question');
  });

  it('still allows marking after the deadline', () => {
    // Bookkeeping, not an answer — a taker reviewing a timed-out attempt can
    // tidy flags without being able to change a response.
    const result = reduce(
      pkg,
      attemptState(),
      { t: 'mark', questionId: 'q1', on: true },
      ctx('2026-08-07T11:00:00.000Z'),
    );
    expect(result.rejected).toBeNull();
  });
});

describe('reduce › navigate', () => {
  it('moves the cursor and emits no mutation', () => {
    const result = reduce(pkg, attemptState(), { t: 'navigate', to: 2 }, ctx());
    expect(result.state.cursor).toBe(2);
    expect(result.mutations).toEqual([]);
  });

  it('rejects a negative index', () => {
    expect(reduce(pkg, attemptState(), { t: 'navigate', to: -1 }, ctx()).rejected).toBe(
      'cursor_out_of_range',
    );
  });

  it('rejects an index past the last question', () => {
    expect(reduce(pkg, attemptState(), { t: 'navigate', to: 3 }, ctx()).rejected).toBe(
      'cursor_out_of_range',
    );
  });

  it('allows only forward steps when navigation is disabled', () => {
    const linear = testPackage([choiceQuestion('q1'), shortQuestion('q2'), essayQuestion('q3')], {
      allowNavigation: false,
    });
    expect(
      reduce(linear, attemptState({ cursor: 1 }), { t: 'navigate', to: 2 }, ctx()).rejected,
    ).toBeNull();
    expect(
      reduce(linear, attemptState({ cursor: 1 }), { t: 'navigate', to: 0 }, ctx()).rejected,
    ).toBe('navigation_disabled');
    expect(
      reduce(linear, attemptState({ cursor: 0 }), { t: 'navigate', to: 2 }, ctx()).rejected,
    ).toBe('navigation_disabled');
  });
});

describe('reduce › submit', () => {
  it('stamps submittedAt from the supplied clock', () => {
    const result = reduce(pkg, attemptState(), { t: 'submit' }, ctx());
    expect(result.state.submittedAt).toBe('2026-08-07T10:05:00.000Z');
  });

  it('emits no mutation — submit is its own idempotent endpoint', () => {
    expect(reduce(pkg, attemptState(), { t: 'submit' }, ctx()).mutations).toEqual([]);
  });

  it('allows submitting late rather than stranding the attempt', () => {
    const result = reduce(pkg, attemptState(), { t: 'submit' }, ctx('2026-08-07T10:45:00.000Z'));
    expect(result.rejected).toBeNull();
    expect(result.state.submittedAt).toBe('2026-08-07T10:45:00.000Z');
  });
});

describe('reduce › a submitted attempt is closed', () => {
  const submitted = attemptState({ submittedAt: '2026-08-07T10:10:00.000Z' });

  it.each([
    ['answer', { t: 'answer' as const, questionId: 'q1', value: choiceAnswer }],
    ['mark', { t: 'mark' as const, questionId: 'q1', on: true }],
    ['navigate', { t: 'navigate' as const, to: 1 }],
    ['submit', { t: 'submit' as const }],
  ])('rejects %s', (_label, event) => {
    const result = reduce(pkg, submitted, event, ctx());
    expect(result.rejected).toBe('already_submitted');
    expect(result.state).toBe(submitted);
  });

  it('reports already_submitted rather than deadline_passed when both apply', () => {
    // A taker who submitted on time and reloads late should not be told they
    // ran out of time.
    const result = reduce(
      pkg,
      submitted,
      { t: 'answer', questionId: 'q1', value: choiceAnswer },
      ctx('2026-08-07T11:00:00.000Z'),
    );
    expect(result.rejected).toBe('already_submitted');
  });
});
