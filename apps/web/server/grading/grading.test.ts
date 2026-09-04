import { findAttemptById } from '@/data/attempts';
import { applyMutations } from '@/server/attempts/apply-mutations';
import { getTestPackage } from '@/server/attempts/get-test-package';
import { startAttempt } from '@/server/attempts/start-attempt';
import { submitAttempt } from '@/server/attempts/submit-attempt';
import type { AuthedContext } from '@/server/context.types';
import { addQuestion } from '@/server/tests/add-question';
import { createTest } from '@/server/tests/create-test';
import { publishTest } from '@/server/tests/publish-test';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { releaseResults } from './release-results';
import { scoreWrittenAnswer } from './score-written-answer';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const body = { type: 'doc' as const, content: [] };
const START = new Date('2026-08-07T10:00:00.000Z');

/** One auto-marked question worth 2, one essay worth 5. */
const seed = async () => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  const ctx = authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });

  const test = await createTest(ctx, {
    title: 'Mixed',
    timeLimitMinutes: null,
    allowNavigation: true,
    maxAttempts: 5,
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
    question: { type: 'essay', body, points: 5, settings: { minWords: null, maxWords: null } },
  });

  await publishTest(ctx, { testId: test.id });
  const pkg = await getTestPackage(publicContext(harness.db, START), { code: test.code });
  return { org, user, ctx, test, pkg };
};

/** Take the test correctly and submit, leaving the essay for a human. */
const takeAndSubmit = async (
  ctx: AuthedContext,
  code: string,
  pkg: Awaited<ReturnType<typeof getTestPackage>>,
  takerName: string,
) => {
  const take = publicContext(harness.db, START);
  const attempt = await startAttempt(take, { code, takerName, takerRef: null });
  const choice = pkg.questions[0];
  const optionId = choice?.type === 'choice' ? (choice.options[0]?.id ?? '') : '';

  await applyMutations(take, {
    attemptId: attempt.id,
    mutations: [
      {
        kind: 'answer',
        id: ctx.newId(),
        attemptId: attempt.id,
        questionId: choice?.id ?? '',
        value: { kind: 'choice', optionIds: [optionId] },
        clientSeq: 1,
        at: START.toISOString(),
      },
    ],
  });

  return submitAttempt(take, { attemptId: attempt.id });
};

describe('scoreWrittenAnswer', () => {
  it('records a mark and moves the attempt to graded', async () => {
    const { ctx, test, pkg } = await seed();
    const attempt = await takeAndSubmit(ctx, test.code, pkg, 'Ada');
    expect(attempt.status).toBe('submitted');

    const essayId = pkg.questions[1]?.id ?? '';
    const graded = await scoreWrittenAnswer(ctx, {
      attemptId: attempt.id,
      questionId: essayId,
      score: 4,
      feedback: null,
    });

    expect(graded.status).toBe('graded');
    expect(graded.score).toBe(6); // 2 auto + 4 manual
    expect(graded.maxScore).toBe(7);
  });

  it('recomputes the total when a mark is revised rather than adding a delta', async () => {
    const { ctx, test, pkg } = await seed();
    const attempt = await takeAndSubmit(ctx, test.code, pkg, 'Ada');
    const essayId = pkg.questions[1]?.id ?? '';

    await scoreWrittenAnswer(ctx, {
      attemptId: attempt.id,
      questionId: essayId,
      score: 5,
      feedback: null,
    });
    const revised = await scoreWrittenAnswer(ctx, {
      attemptId: attempt.id,
      questionId: essayId,
      score: 1,
      feedback: null,
    });

    // Incrementing would have drifted to 8 here, and the drift would be invisible.
    expect(revised.score).toBe(3);
  });

  it('refuses a mark above the question total', async () => {
    const { ctx, test, pkg } = await seed();
    const attempt = await takeAndSubmit(ctx, test.code, pkg, 'Ada');

    await expect(
      scoreWrittenAnswer(ctx, {
        attemptId: attempt.id,
        questionId: pkg.questions[1]?.id ?? '',
        score: 99,
        feedback: null,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('refuses to hand-mark an auto-marked question', async () => {
    const { ctx, test, pkg } = await seed();
    const attempt = await takeAndSubmit(ctx, test.code, pkg, 'Ada');

    await expect(
      scoreWrittenAnswer(ctx, {
        attemptId: attempt.id,
        questionId: pkg.questions[0]?.id ?? '',
        score: 1,
        feedback: null,
      }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('hides an attempt belonging to another organisation', async () => {
    const { test, pkg, ctx } = await seed();
    const attempt = await takeAndSubmit(ctx, test.code, pkg, 'Ada');

    const otherOrg = await makeOrg(harness.db);
    const otherUser = await makeUser(harness.db, otherOrg.id);
    const intruder = authedContext(harness.db, {
      userId: otherUser.id,
      orgId: otherOrg.id,
      role: 'teacher',
    });

    // `not_found`, not `forbidden` — telling a stranger the attempt exists is
    // itself a leak.
    await expect(
      scoreWrittenAnswer(intruder, {
        attemptId: attempt.id,
        questionId: pkg.questions[1]?.id ?? '',
        score: 1,
        feedback: null,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('releaseResults', () => {
  it('releases fully-marked attempts and holds back unmarked ones', async () => {
    const { ctx, test, pkg } = await seed();
    const ada = await takeAndSubmit(ctx, test.code, pkg, 'Ada');
    await takeAndSubmit(ctx, test.code, pkg, 'Grace');

    await scoreWrittenAnswer(ctx, {
      attemptId: ada.id,
      questionId: pkg.questions[1]?.id ?? '',
      score: 5,
      feedback: null,
    });

    const summary = await releaseResults(ctx, { testId: test.id });

    // Grace's essay is unmarked. Releasing her attempt would show a total that
    // counts the essay as zero — a number she would reasonably read as her mark.
    expect(summary).toEqual({ released: 1, pending: 1 });

    const released = await findAttemptById(harness.db, ada.id);
    expect(released?.status).toBe('released');
    expect(released?.releasedAt).toEqual(START);
  });

  it('is safe to run twice', async () => {
    const { ctx, test, pkg } = await seed();
    const ada = await takeAndSubmit(ctx, test.code, pkg, 'Ada');
    await scoreWrittenAnswer(ctx, {
      attemptId: ada.id,
      questionId: pkg.questions[1]?.id ?? '',
      score: 5,
      feedback: null,
    });

    await releaseResults(ctx, { testId: test.id });
    const second = await releaseResults(ctx, { testId: test.id });

    // Already-released attempts are no longer `graded`, so they are not picked
    // up again and no duplicate event is emitted.
    expect(second).toEqual({ released: 0, pending: 0 });
  });

  it('refuses to release a draft test', async () => {
    const org = await makeOrg(harness.db);
    const user = await makeUser(harness.db, org.id);
    const ctx = authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });
    const draft = await createTest(ctx, {
      title: 'Draft',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });

    await expect(releaseResults(ctx, { testId: draft.id })).rejects.toMatchObject({
      code: 'invalid_state',
    });
  });

  it('hides a test belonging to another organisation', async () => {
    const { test } = await seed();
    const otherOrg = await makeOrg(harness.db);
    const otherUser = await makeUser(harness.db, otherOrg.id);
    const intruder = authedContext(harness.db, {
      userId: otherUser.id,
      orgId: otherOrg.id,
      role: 'teacher',
    });

    await expect(releaseResults(intruder, { testId: test.id })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
