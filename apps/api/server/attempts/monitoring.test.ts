import { listAttemptEvents } from '@/data/attempt-events';
import { listResponsesForAttempt } from '@/data/responses';
import type { AuthedContext, PublicContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addQuestion } from '../tests/add-question';
import { createTest } from '../tests/create-test';
import { publishTest } from '../tests/publish-test';
import { applyMutations } from './apply-mutations';
import { startAttempt } from './start-attempt';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const text = (s: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: s }] }],
});

const setUp = async () => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  const teacher: AuthedContext = authedContext(harness.db, {
    userId: user.id,
    orgId: org.id,
    role: 'teacher',
  });

  const test = await createTest(teacher, {
    title: 'Monitored',
    timeLimitMinutes: null,
    allowNavigation: true,
    maxAttempts: 1,
  });
  const question = await addQuestion(teacher, {
    testId: test.id,
    question: {
      type: 'choice',
      body: text('Q1'),
      points: 1,
      settings: { selection: 'single', variant: 'plain', rubric: null, partialCredit: false },
      options: [
        { body: text('A'), isCorrect: true },
        { body: text('B'), isCorrect: false },
      ],
    },
  });
  await publishTest(teacher, { testId: test.id });

  const student: PublicContext = publicContext(harness.db);
  const { attempt, token } = await startAttempt(student, {
    code: test.code,
    takerName: 'Ada',
    takerRef: null,
  });

  return { student, attempt, token, questionId: question.id };
};

/** An answer has to exist before there is a response row to bank time against. */
const answer = (attemptId: string, questionId: string) => ({
  kind: 'answer' as const,
  id: randomUUID(),
  attemptId,
  questionId,
  value: { kind: 'choice' as const, optionIds: [] },
  clientSeq: 0,
  at: new Date().toISOString(),
});

describe('time spent per question', () => {
  it('adds deltas rather than replacing a total', async () => {
    // Two visits to the same question must sum. A total sent by the client
    // would let the second overwrite the first.
    const { student, attempt, token, questionId } = await setUp();

    await applyMutations(student, {
      attemptId: attempt.id,
      token,
      mutations: [
        answer(attempt.id, questionId),
        {
          kind: 'timing',
          id: randomUUID(),
          attemptId: attempt.id,
          questionId,
          msDelta: 4000,
          clientSeq: 1,
          at: new Date().toISOString(),
        },
        {
          kind: 'timing',
          id: randomUUID(),
          attemptId: attempt.id,
          questionId,
          msDelta: 6500,
          clientSeq: 2,
          at: new Date().toISOString(),
        },
      ],
    });

    const [response] = await listResponsesForAttempt(harness.db, attempt.id);
    expect(response?.timeSpentMs).toBe(10500);
  });

  it('counts a resent delta once', async () => {
    // The whole reason timing rides the outbox: a retry after a dropped
    // connection must not inflate the number.
    const { student, attempt, token, questionId } = await setUp();

    const timing = {
      kind: 'timing' as const,
      id: randomUUID(),
      attemptId: attempt.id,
      questionId,
      msDelta: 5000,
      clientSeq: 1,
      at: new Date().toISOString(),
    };

    await applyMutations(student, {
      attemptId: attempt.id,
      token,
      mutations: [answer(attempt.id, questionId), timing],
    });
    await applyMutations(student, { attemptId: attempt.id, token, mutations: [timing] });

    const [response] = await listResponsesForAttempt(harness.db, attempt.id);
    expect(response?.timeSpentMs).toBe(5000);
  });

  it('clamps a delta no honest client would send', async () => {
    const { student, attempt, token, questionId } = await setUp();

    await applyMutations(student, {
      attemptId: attempt.id,
      token,
      mutations: [
        answer(attempt.id, questionId),
        {
          kind: 'timing',
          id: randomUUID(),
          attemptId: attempt.id,
          questionId,
          msDelta: 9 * 60 * 60 * 1000,
          clientSeq: 1,
          at: new Date().toISOString(),
        },
      ],
    });

    const [response] = await listResponsesForAttempt(harness.db, attempt.id);
    // Half an hour, the server's ceiling.
    expect(response?.timeSpentMs).toBe(30 * 60 * 1000);
  });
});

describe('visibility events', () => {
  it('records what the browser observed, in order', async () => {
    const { student, attempt, token } = await setUp();

    await applyMutations(student, {
      attemptId: attempt.id,
      token,
      mutations: [
        {
          kind: 'visibility',
          id: randomUUID(),
          attemptId: attempt.id,
          state: 'hidden',
          clientSeq: 1,
          at: '2026-08-10T10:00:00.000Z',
        },
        {
          kind: 'visibility',
          id: randomUUID(),
          attemptId: attempt.id,
          state: 'visible',
          clientSeq: 2,
          at: '2026-08-10T10:00:40.000Z',
        },
      ],
    });

    const events = await listAttemptEvents(harness.db, attempt.id);
    expect(events.map((e) => e.kind)).toEqual(['hidden', 'visible']);
  });

  it('does not duplicate a resent event', async () => {
    const { student, attempt, token } = await setUp();

    const event = {
      kind: 'visibility' as const,
      id: randomUUID(),
      attemptId: attempt.id,
      state: 'hidden' as const,
      clientSeq: 1,
      at: new Date().toISOString(),
    };

    await applyMutations(student, { attemptId: attempt.id, token, mutations: [event] });
    await applyMutations(student, { attemptId: attempt.id, token, mutations: [event] });

    expect(await listAttemptEvents(harness.db, attempt.id)).toHaveLength(1);
  });

  it('leaves answers untouched', async () => {
    // Monitoring must never be able to disturb the thing being marked.
    const { student, attempt, token, questionId } = await setUp();

    await applyMutations(student, {
      attemptId: attempt.id,
      token,
      mutations: [
        {
          kind: 'answer',
          id: randomUUID(),
          attemptId: attempt.id,
          questionId,
          value: { kind: 'choice', optionIds: ['x'] },
          clientSeq: 1,
          at: new Date().toISOString(),
        },
        {
          kind: 'visibility',
          id: randomUUID(),
          attemptId: attempt.id,
          state: 'blur',
          clientSeq: 2,
          at: new Date().toISOString(),
        },
      ],
    });

    const [response] = await listResponsesForAttempt(harness.db, attempt.id);
    expect(response?.value).toEqual({ kind: 'choice', optionIds: ['x'] });
  });
});
