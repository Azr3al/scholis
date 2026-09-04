import { listResponsesForAttempt } from '@/data/responses';
import { addQuestion } from '@/server/tests/add-question';
import { createTest } from '@/server/tests/create-test';
import { publishTest } from '@/server/tests/publish-test';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import type { Mutation, ResponseValue, TestPackage } from '@scholis/schema';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMutations } from './apply-mutations';
import { getTestPackage } from './get-test-package';
import { startAttempt } from './start-attempt';
import { submitAttempt } from './submit-attempt';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const body = { type: 'doc' as const, content: [] };
const START = new Date('2026-08-07T10:00:00.000Z');

const seed = async (options: { withEssay?: boolean; maxAttempts?: number } = {}) => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  const ctx = authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });

  const test = await createTest(ctx, {
    title: 'Biology',
    timeLimitMinutes: 30,
    allowNavigation: true,
    maxAttempts: options.maxAttempts ?? 1,
  });

  await addQuestion(ctx, {
    testId: test.id,
    question: {
      type: 'choice',
      body,
      points: 2,
      settings: { selection: 'single', variant: 'plain', partialCredit: false },
      options: [
        { body, isCorrect: true },
        { body, isCorrect: false },
      ],
    },
  });

  await addQuestion(ctx, {
    testId: test.id,
    question: {
      type: 'short',
      body,
      points: 3,
      settings: { caseSensitive: false },
      acceptedAnswers: ['Paris'],
    },
  });

  if (options.withEssay === true) {
    await addQuestion(ctx, {
      testId: test.id,
      question: { type: 'essay', body, points: 5, settings: { minWords: null, maxWords: null } },
    });
  }

  await publishTest(ctx, { testId: test.id });

  const pkg = await getTestPackage(publicContext(harness.db, START), { code: test.code });
  return { org, user, test, pkg };
};

const answer = (
  attemptId: string,
  pkg: TestPackage,
  index: number,
  value: ResponseValue,
  clientSeq: number,
): Mutation => ({
  kind: 'answer',
  id: randomUUID(),
  attemptId,
  questionId: pkg.questions[index]?.id ?? '',
  value,
  clientSeq,
  at: START.toISOString(),
});

describe('startAttempt', () => {
  it('stamps a server-computed deadline', async () => {
    const { test } = await seed();
    const attempt = await startAttempt(publicContext(harness.db, START), {
      code: test.code,
      takerName: 'Ada',
      takerRef: null,
    });

    expect(attempt.status).toBe('in_progress');
    expect(attempt.startedAt).toEqual(START);
    expect(attempt.serverDeadlineAt).toEqual(new Date('2026-08-07T10:30:00.000Z'));
  });

  it('leaves the deadline null for an untimed test', async () => {
    const org = await makeOrg(harness.db);
    const user = await makeUser(harness.db, org.id);
    const ctx = authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });
    const test = await createTest(ctx, {
      title: 'Untimed',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });
    await addQuestion(ctx, {
      testId: test.id,
      question: { type: 'essay', body, points: 1, settings: { minWords: null, maxWords: null } },
    });
    await publishTest(ctx, { testId: test.id });

    const attempt = await startAttempt(publicContext(harness.db, START), {
      code: test.code,
      takerName: 'Ada',
      takerRef: null,
    });
    expect(attempt.serverDeadlineAt).toBeNull();
  });

  it('enforces the attempt limit per taker name', async () => {
    const { test } = await seed();
    const ctx = publicContext(harness.db, START);
    await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });

    await expect(
      startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null }),
    ).rejects.toMatchObject({ code: 'invalid_state' });

    // A different name is a different taker — identity is self-declared, so the
    // limit is an honesty mechanism rather than a control.
    await expect(
      startAttempt(ctx, { code: test.code, takerName: 'Grace', takerRef: null }),
    ).resolves.toMatchObject({ status: 'in_progress' });
  });
});

describe('applyMutations', () => {
  it('records answers and reports them applied', async () => {
    const { test, pkg } = await seed();
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });

    const first = pkg.questions[0]?.id ?? '';
    const optionId =
      pkg.questions[0]?.type === 'choice' ? (pkg.questions[0].options[0]?.id ?? '') : '';

    const mutation: Mutation = {
      kind: 'answer',
      id: randomUUID(),
      attemptId: attempt.id,
      questionId: first,
      value: { kind: 'choice', optionIds: [optionId] },
      clientSeq: 1,
      at: START.toISOString(),
    };

    const result = await applyMutations(ctx, { attemptId: attempt.id, mutations: [mutation] });

    expect(result.applied).toEqual([mutation.id]);
    const stored = await listResponsesForAttempt(harness.db, attempt.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.value).toEqual({ kind: 'choice', optionIds: [optionId] });
  });

  it('is idempotent when a batch is redelivered', async () => {
    const { test, pkg } = await seed();
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });
    const mutation = answer(attempt.id, pkg, 1, { kind: 'short', text: 'Paris' }, 1);

    await applyMutations(ctx, { attemptId: attempt.id, mutations: [mutation] });
    const second = await applyMutations(ctx, { attemptId: attempt.id, mutations: [mutation] });

    // Still reported applied: the client's question is "may I drop this from my
    // outbox?", and for an already-recorded mutation the answer is yes.
    expect(second.applied).toEqual([mutation.id]);
    expect(await listResponsesForAttempt(harness.db, attempt.id)).toHaveLength(1);
  });

  it('ignores a stale mutation that arrives out of order', async () => {
    const { test, pkg } = await seed();
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });

    const newer = answer(attempt.id, pkg, 1, { kind: 'short', text: 'Paris' }, 5);
    const older = answer(attempt.id, pkg, 1, { kind: 'short', text: 'Berlin' }, 2);

    await applyMutations(ctx, { attemptId: attempt.id, mutations: [newer] });
    await applyMutations(ctx, { attemptId: attempt.id, mutations: [older] });

    const stored = await listResponsesForAttempt(harness.db, attempt.id);
    expect(stored[0]?.value).toEqual({ kind: 'short', text: 'Paris' });
    expect(stored[0]?.clientSeq).toBe(5);
  });

  it('rejects a mutation aimed at a different attempt', async () => {
    const { test, pkg } = await seed({ maxAttempts: 2 });
    const ctx = publicContext(harness.db, START);
    const a = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });
    const b = await startAttempt(ctx, { code: test.code, takerName: 'Grace', takerRef: null });

    await expect(
      applyMutations(ctx, {
        attemptId: a.id,
        mutations: [answer(b.id, pkg, 0, { kind: 'choice', optionIds: [] }, 1)],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('refuses writes to a submitted attempt', async () => {
    const { test, pkg } = await seed();
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });
    await submitAttempt(ctx, { attemptId: attempt.id });

    await expect(
      applyMutations(ctx, {
        attemptId: attempt.id,
        mutations: [answer(attempt.id, pkg, 1, { kind: 'short', text: 'late' }, 9)],
      }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });
});

describe('submitAttempt', () => {
  it('auto-marks objective questions and grades the attempt', async () => {
    const { test, pkg } = await seed();
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });

    const correctOption =
      pkg.questions[0]?.type === 'choice' ? (pkg.questions[0].options[0]?.id ?? '') : '';

    await applyMutations(ctx, {
      attemptId: attempt.id,
      mutations: [
        answer(attempt.id, pkg, 0, { kind: 'choice', optionIds: [correctOption] }, 1),
        answer(attempt.id, pkg, 1, { kind: 'short', text: 'paris' }, 2),
      ],
    });

    const submitted = await submitAttempt(ctx, { attemptId: attempt.id });

    expect(submitted.status).toBe('graded');
    expect(submitted.score).toBe(5);
    expect(submitted.maxScore).toBe(5);
    expect(submitted.overdueSeconds).toBe(0);
  });

  it('holds an attempt with essays at submitted, not graded', async () => {
    const { test } = await seed({ withEssay: true });
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });

    const submitted = await submitAttempt(ctx, { attemptId: attempt.id });

    // `submitted` means a human still has to mark it. Release gating depends on
    // `graded` meaning fully marked.
    expect(submitted.status).toBe('submitted');
    expect(submitted.maxScore).toBe(10);
  });

  it('is idempotent — a retried submit returns the same result', async () => {
    const { test } = await seed();
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });

    const first = await submitAttempt(ctx, { attemptId: attempt.id });
    const second = await submitAttempt(ctx, { attemptId: attempt.id });

    expect(second.submittedAt).toEqual(first.submittedAt);
    expect(second.score).toBe(first.score);
  });

  it('computes overdue seconds from the server clock', async () => {
    const { test } = await seed();
    const attempt = await startAttempt(publicContext(harness.db, START), {
      code: test.code,
      takerName: 'Ada',
      takerRef: null,
    });

    // Deadline was 10:30. Submitting at 10:32 is 120 seconds late, regardless of
    // what the device believed.
    const late = publicContext(harness.db, new Date('2026-08-07T10:32:00.000Z'));
    const submitted = await submitAttempt(late, { attemptId: attempt.id });

    expect(submitted.overdueSeconds).toBe(120);
    expect(submitted.status).toBe('graded');
  });

  it('scores an unanswered attempt zero out of the full total', async () => {
    const { test } = await seed();
    const ctx = publicContext(harness.db, START);
    const attempt = await startAttempt(ctx, { code: test.code, takerName: 'Ada', takerRef: null });

    const submitted = await submitAttempt(ctx, { attemptId: attempt.id });
    expect(submitted.score).toBe(0);
    expect(submitted.maxScore).toBe(5);
  });
});
