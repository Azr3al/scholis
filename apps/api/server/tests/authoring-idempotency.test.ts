import { listKeyedQuestions } from '@/data/questions';
import { listTestsForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { authedContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addQuestion } from './add-question';
import { createTest } from './create-test';

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

const seed = async (): Promise<{ ctx: AuthedContext; orgId: string }> => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  return {
    ctx: authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' }),
    orgId: org.id,
  };
};

const testInput = {
  title: 'Biology',
  timeLimitMinutes: null,
  allowNavigation: true,
  maxAttempts: 1,
};

const choiceQuestion = {
  type: 'choice' as const,
  body,
  points: 2,
  settings: { selection: 'single' as const, variant: 'plain' as const, rubric: null, partialCredit: false },
  options: [
    { body, isCorrect: true },
    { body, isCorrect: false },
  ],
};

/**
 * The scenario these protect: the UI shows the result before the request
 * completes and retries quietly on bad wifi. Without idempotency that is how a
 * teacher ends up with three copies of question four.
 */
describe('createTest idempotency', () => {
  it('returns the original test when the same key is retried', async () => {
    const { ctx, orgId } = await seed();
    const key = randomUUID();

    const first = await createTest(ctx, { ...testInput, idempotencyKey: key });
    const second = await createTest(ctx, { ...testInput, idempotencyKey: key });

    expect(second.id).toBe(first.id);
    expect(second.code).toBe(first.code);
    expect(await listTestsForOrg(harness.db, orgId)).toHaveLength(1);
  });

  it('creates separate tests for different keys', async () => {
    const { ctx, orgId } = await seed();

    await createTest(ctx, { ...testInput, idempotencyKey: randomUUID() });
    await createTest(ctx, { ...testInput, idempotencyKey: randomUUID() });

    expect(await listTestsForOrg(harness.db, orgId)).toHaveLength(2);
  });

  it('still creates every time when no key is supplied', async () => {
    // Idempotency is opt-in. A caller that does not ask for it gets the plain
    // behaviour rather than a surprising silent de-duplication.
    const { ctx, orgId } = await seed();

    await createTest(ctx, testInput);
    await createTest(ctx, testInput);

    expect(await listTestsForOrg(harness.db, orgId)).toHaveLength(2);
  });

  it('does not let one organisation resolve another organisation key', async () => {
    const a = await seed();
    const b = await seed();
    const key = randomUUID();

    const mine = await createTest(a.ctx, { ...testInput, idempotencyKey: key });
    const theirs = await createTest(b.ctx, { ...testInput, idempotencyKey: key });

    expect(theirs.id).not.toBe(mine.id);
    expect(await listTestsForOrg(harness.db, a.orgId)).toHaveLength(1);
    expect(await listTestsForOrg(harness.db, b.orgId)).toHaveLength(1);
  });
});

describe('addQuestion idempotency', () => {
  it('returns the original question when the same key is retried', async () => {
    const { ctx } = await seed();
    const test = await createTest(ctx, testInput);
    const key = randomUUID();

    const first = await addQuestion(ctx, {
      testId: test.id,
      question: choiceQuestion,
      idempotencyKey: key,
    });
    const second = await addQuestion(ctx, {
      testId: test.id,
      question: choiceQuestion,
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
    expect(await listKeyedQuestions(harness.db, test.id)).toHaveLength(1);
  });

  it('does not duplicate the options of a retried question', async () => {
    // The subtler failure: the question de-duplicates but its options do not,
    // leaving a two-option question showing four choices.
    const { ctx } = await seed();
    const test = await createTest(ctx, testInput);
    const key = randomUUID();

    await addQuestion(ctx, { testId: test.id, question: choiceQuestion, idempotencyKey: key });
    await addQuestion(ctx, { testId: test.id, question: choiceQuestion, idempotencyKey: key });

    const questions = await listKeyedQuestions(harness.db, test.id);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.type === 'choice' ? questions[0].options : []).toHaveLength(2);
  });

  it('creates separate questions for different keys', async () => {
    const { ctx } = await seed();
    const test = await createTest(ctx, testInput);

    await addQuestion(ctx, {
      testId: test.id,
      question: choiceQuestion,
      idempotencyKey: randomUUID(),
    });
    await addQuestion(ctx, {
      testId: test.id,
      question: choiceQuestion,
      idempotencyKey: randomUUID(),
    });

    expect(await listKeyedQuestions(harness.db, test.id)).toHaveLength(2);
  });
});
