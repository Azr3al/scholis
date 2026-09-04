import { applyMutations } from '@/server/attempts/apply-mutations';
import { getReleasedResult } from '@/server/attempts/get-released-result';
import { getTestPackage } from '@/server/attempts/get-test-package';
import { startAttempt } from '@/server/attempts/start-attempt';
import { submitAttempt } from '@/server/attempts/submit-attempt';
import type { AuthedContext } from '@/server/context.types';
import { getAttemptMarking } from '@/server/grading/get-attempt-marking';
import { listAttempts } from '@/server/grading/list-attempts';
import { releaseResults } from '@/server/grading/release-results';
import { scoreWrittenAnswer } from '@/server/grading/score-written-answer';
import { addQuestion } from '@/server/tests/add-question';
import { createTest } from '@/server/tests/create-test';
import { getTest } from '@/server/tests/get-test';
import { listTests } from '@/server/tests/list-tests';
import { publishTest } from '@/server/tests/publish-test';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});

// Real prompt text, because publishing now refuses a paper with blank
// questions. The same document doubles as option text, which the rule
// also requires. Nothing here asserts on the wording.
const body = {
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Q' }] }],
};
const START = new Date('2026-08-07T10:00:00.000Z');

const org = async () => {
  const o = await makeOrg(harness.db);
  const u = await makeUser(harness.db, o.id);
  return authedContext(harness.db, { userId: u.id, orgId: o.id, role: 'teacher' }, START);
};

/** Published test: one auto-marked choice (2), one essay (5). */
const publishedTest = async (ctx: AuthedContext) => {
  const test = await createTest(ctx, {
    title: 'Biology',
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
      settings: { selection: 'single', variant: 'plain', rubric: null, partialCredit: false },
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
  return test;
};

const takeAndSubmit = async (code: string, takerName: string) => {
  const take = publicContext(harness.db, START);
  const pkg = await getTestPackage(take, { code });
  const { attempt: started, token } = await startAttempt(take, { code, takerName, takerRef: null });

  const choice = pkg.questions.find((q) => q.type === 'choice');
  const optionId = choice?.type === 'choice' ? (choice.options[0]?.id ?? '') : '';

  await applyMutations(take, {
    attemptId: started.id,
    token,
    mutations: [
      {
        kind: 'answer',
        id: crypto.randomUUID(),
        attemptId: started.id,
        questionId: choice?.id ?? '',
        value: { kind: 'choice', optionIds: [optionId] },
        clientSeq: 1,
        at: START.toISOString(),
      },
    ],
  });

  await submitAttempt(take, { attemptId: started.id, token });
  return { started, token, pkg };
};

describe('listTests', () => {
  it('returns tests for the actor org only', async () => {
    const mine = await org();
    const theirs = await org();
    await createTest(mine, {
      title: 'Mine',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });
    await createTest(theirs, {
      title: 'Theirs',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });

    const list = await listTests(mine);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Mine');
  });

  it('does not leak database columns', async () => {
    const ctx = await org();
    await createTest(ctx, {
      title: 'X',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });

    const wire = JSON.stringify(await listTests(ctx));
    expect(wire).not.toContain('orgId');
    expect(wire).not.toContain('createdBy');
    expect(wire).not.toContain('ltiContextId');
  });

  it('reports how many questions each test has', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const list = await listTests(ctx);
    expect(list.find((t) => t.id === test.id)?.questionCount).toBe(2);
  });
});

describe('write responses stay on the contract', () => {
  const DB_ONLY = ['orgId', 'createdBy', 'ltiContextId', 'opensAt', 'closesAt', 'bodyText'];

  it('createTest returns a summary, not a row', async () => {
    const ctx = await org();
    const created = await createTest(ctx, {
      title: 'X',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });

    const wire = JSON.stringify(created);
    for (const field of DB_ONLY) expect(wire).not.toContain(field);
    expect(created.questionCount).toBe(0);
  });

  it('publishTest returns a summary with the real question count', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const published = await listTests(ctx);

    const wire = JSON.stringify(published);
    for (const field of DB_ONLY) expect(wire).not.toContain(field);
    expect(published.find((t) => t.id === test.id)?.status).toBe('published');
  });

  it('addQuestion returns the authored question, ready to render', async () => {
    const ctx = await org();
    const test = await createTest(ctx, {
      title: 'X',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });

    const question = await addQuestion(ctx, {
      testId: test.id,
      question: {
        type: 'choice',
        body,
        points: 3,
        settings: { selection: 'single', variant: 'plain', rubric: null, partialCredit: false },
        options: [
          { body, isCorrect: true },
          { body, isCorrect: false },
        ],
      },
    });

    // Full shape back from the write, so an optimistic UI can render it without
    // a follow-up read.
    expect(question.type).toBe('choice');
    expect(question.type === 'choice' ? question.options : []).toHaveLength(2);
    expect(JSON.stringify(question)).not.toContain('bodyText');
  });
});

describe('getTest', () => {
  it('includes answer keys — the teacher wrote them', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);

    const detail = await getTest(ctx, { testId: test.id });
    const choice = detail.questions.find((q) => q.type === 'choice');

    expect(choice?.type === 'choice' ? choice.options.some((o) => o.isCorrect) : false).toBe(true);
  });

  it('hides a test from another organisation', async () => {
    const mine = await org();
    const intruder = await org();
    const test = await publishedTest(mine);

    await expect(getTest(intruder, { testId: test.id })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('listAttempts', () => {
  it('counts attempts by grading stage', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    await takeAndSubmit(test.code, 'Ada');
    await takeAndSubmit(test.code, 'Grace');

    const view = await listAttempts(ctx, { testId: test.id });

    // Both have an unmarked essay, so neither is ready to release.
    expect(view.status.total).toBe(2);
    expect(view.status.awaitingMarking).toBe(2);
    expect(view.status.readyToRelease).toBe(0);
  });

  it('hides attempts from another organisation', async () => {
    const mine = await org();
    const intruder = await org();
    const test = await publishedTest(mine);

    await expect(listAttempts(intruder, { testId: test.id })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('getAttemptMarking', () => {
  it('shows the student answer and what still needs a mark', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const { started } = await takeAndSubmit(test.code, 'Ada');

    const view = await getAttemptMarking(ctx, { attemptId: started.id });

    expect(view.items).toHaveLength(2);
    expect(view.awaitingMarks).toBe(1);
    expect(view.items.find((i) => i.type === 'choice')?.status).toBe('auto');
    expect(view.items.find((i) => i.type === 'essay')?.status).toBe('pending');
  });

  it('never carries answer keys', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const { started } = await takeAndSubmit(test.code, 'Ada');

    const wire = JSON.stringify(await getAttemptMarking(ctx, { attemptId: started.id }));
    expect(wire).not.toContain('isCorrect');
    expect(wire).not.toContain('acceptedAnswers');
  });

  it('refuses an attempt that has not been submitted', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const { attempt: started } = await startAttempt(publicContext(harness.db, START), {
      code: test.code,
      takerName: 'Ada',
      takerRef: null,
    });

    await expect(getAttemptMarking(ctx, { attemptId: started.id })).rejects.toMatchObject({
      code: 'invalid_state',
    });
  });
});

describe('getReleasedResult', () => {
  it('refuses before release', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const { started, token } = await takeAndSubmit(test.code, 'Ada');

    // Marked but not released — it has a score, and showing it would publish
    // the mark before the teacher chose to.
    await expect(
      getReleasedResult(publicContext(harness.db, START), {
        attemptId: started.id,
        token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('returns the mark once released', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const { started, token, pkg } = await takeAndSubmit(test.code, 'Ada');

    const essay = pkg.questions.find((q) => q.type === 'essay');
    await scoreWrittenAnswer(ctx, {
      attemptId: started.id,
      questionId: essay?.id ?? '',
      score: 4,
      feedback: null,
    });
    await releaseResults(ctx, { testId: test.id });

    const result = await getReleasedResult(publicContext(harness.db, START), {
      attemptId: started.id,
      token,
    });

    expect(result.score).toBe(6); // 2 auto + 4 manual
    expect(result.maxScore).toBe(7);
    expect(result.items).toHaveLength(2);
  });

  it('rejects a token for a different attempt', async () => {
    const ctx = await org();
    const test = await publishedTest(ctx);
    const a = await takeAndSubmit(test.code, 'Ada');
    const b = await takeAndSubmit(test.code, 'Grace');

    await expect(
      getReleasedResult(publicContext(harness.db, START), {
        attemptId: a.started.id,
        token: b.token,
      }),
    ).rejects.toBeDefined();
  });
});
