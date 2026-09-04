import { applyMutations } from '@/server/attempts/apply-mutations';
import { getTestPackage } from '@/server/attempts/get-test-package';
import { startAttempt } from '@/server/attempts/start-attempt';
import { submitAttempt } from '@/server/attempts/submit-attempt';
import { submitComment } from '@/server/attempts/submit-comment';
import { listComments } from '@/server/grading/list-comments';
import { addQuestion } from '@/server/tests/add-question';
import { createTest } from '@/server/tests/create-test';
import { publishTest } from '@/server/tests/publish-test';
import type { AuthedContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { textToRichText } from '@scholis/schema';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

const body = textToRichText('Sample question');
const option = textToRichText('Option');
const START = new Date('2026-08-07T10:00:00.000Z');

const seedSubmitted = async (): Promise<{
  ctx: AuthedContext;
  testId: string;
  token: string;
  attemptId: string;
}> => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  const ctx = authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });

  const test = await createTest(ctx, {
    title: 'Feedback drill',
    timeLimitMinutes: null,
    allowNavigation: true,
    maxAttempts: 1,
  });

  await addQuestion(ctx, {
    testId: test.id,
    question: {
      type: 'choice',
      body,
      points: 1,
      settings: { selection: 'single', variant: 'plain', rubric: null, partialCredit: false },
      options: [
        { body: option, isCorrect: true },
        { body: textToRichText('Wrong'), isCorrect: false },
      ],
    },
  });

  await publishTest(ctx, { testId: test.id });
  const pkg = await getTestPackage(publicContext(harness.db, START), { code: test.code });
  const take = publicContext(harness.db, START);
  const { attempt, token } = await startAttempt(take, {
    code: test.code,
    takerName: 'Ada',
    takerRef: null,
  });

  const choice = pkg.questions[0];
  const optionId = choice?.type === 'choice' ? (choice.options[0]?.id ?? '') : '';

  await applyMutations(take, {
    attemptId: attempt.id,
    token,
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

  await submitAttempt(take, { attemptId: attempt.id, token });

  return { ctx, testId: test.id, token, attemptId: attempt.id };
};

describe('student comments', () => {
  it('stores feedback on a submitted attempt', async () => {
    const { ctx, testId, token, attemptId } = await seedSubmitted();
    const take = publicContext(harness.db, START);

    const saved = await submitComment(take, {
      attemptId,
      token,
      body: '  Great test!  ',
    });

    expect(saved.body).toBe('Great test!');

    const view = await listComments(ctx, { testId });
    expect(view.comments).toHaveLength(1);
    expect(view.comments[0]?.body).toBe('Great test!');
    expect(view.comments[0]?.takerName).toBe('Ada');
  });

  it('is idempotent when a comment already exists', async () => {
    const { ctx, testId, token, attemptId } = await seedSubmitted();
    const take = publicContext(harness.db, START);

    await submitComment(take, { attemptId, token, body: 'First' });
    const again = await submitComment(take, { attemptId, token, body: 'Second' });

    expect(again.body).toBe('First');
    const view = await listComments(ctx, { testId });
    expect(view.comments).toHaveLength(1);
  });

  it('refuses before hand-in', async () => {
    const org = await makeOrg(harness.db);
    const user = await makeUser(harness.db, org.id);
    const ctx = authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });
    const test = await createTest(ctx, {
      title: 'Draft',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });
    await addQuestion(ctx, {
      testId: test.id,
      question: {
        type: 'choice',
        body,
        points: 1,
        settings: { selection: 'single', variant: 'plain', rubric: null, partialCredit: false },
        options: [
          { body, isCorrect: true },
          { body, isCorrect: false },
        ],
      },
    });
    await publishTest(ctx, { testId: test.id });
    const take = publicContext(harness.db, START);
    const { attempt, token } = await startAttempt(take, {
      code: test.code,
      takerName: 'Bob',
      takerRef: null,
    });

    await expect(
      submitComment(take, { attemptId: attempt.id, token, body: 'Too early' }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('isolates comments across organizations', async () => {
    const { testId, token, attemptId } = await seedSubmitted();
    const take = publicContext(harness.db, START);
    await submitComment(take, { attemptId, token, body: 'Private' });

    const otherOrg = await makeOrg(harness.db);
    const otherUser = await makeUser(harness.db, otherOrg.id);
    const intruder = authedContext(harness.db, {
      userId: otherUser.id,
      orgId: otherOrg.id,
      role: 'teacher',
    });

    await expect(listComments(intruder, { testId })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
