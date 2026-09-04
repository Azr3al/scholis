import { updateTest } from '@/data/tests';
import { addQuestion } from '@/server/tests/add-question';
import { createTest } from '@/server/tests/create-test';
import { publishTest } from '@/server/tests/publish-test';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestPackage } from './get-test-package';

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

/** A published test with one of every question type, keys and all. */
const seedPublishedTest = async () => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  const ctx = authedContext(harness.db, {
    userId: user.id,
    orgId: org.id,
    role: 'teacher',
  });

  const test = await createTest(ctx, {
    title: 'Photosynthesis',
    timeLimitMinutes: 30,
    allowNavigation: true,
    maxAttempts: 1,
  });

  await addQuestion(ctx, {
    testId: test.id,
    question: {
      type: 'choice',
      body,
      points: 2,
      settings: { selection: 'single', variant: 'boolean', rubric: null, partialCredit: false },
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
      points: 1,
      settings: { caseSensitive: false },
      acceptedAnswers: ['chlorophyll', 'chloroplast'],
    },
  });

  await addQuestion(ctx, {
    testId: test.id,
    question: {
      type: 'essay',
      body,
      points: 5,
      settings: { minWords: 50, maxWords: null },
    },
  });

  await publishTest(ctx, { testId: test.id });
  return { org, user, ctx, test };
};

/**
 * THE HIGHEST-VALUE SPEC IN THE REPO.
 *
 * If a key reaches the student's browser, every exam run on Scholis is void.
 * These assert on the serialised payload rather than the object, because that
 * is what actually crosses the wire.
 */
describe('getTestPackage › answer keys never leave the server', () => {
  it('strips isCorrect, acceptedAnswers, and the key text itself', async () => {
    const { test } = await seedPublishedTest();
    const pkg = await getTestPackage(publicContext(harness.db), { code: test.code });

    const wire = JSON.stringify(pkg);
    expect(wire).not.toContain('isCorrect');
    expect(wire).not.toContain('acceptedAnswers');
    expect(wire).not.toContain('chlorophyll');
    expect(wire).not.toContain('chloroplast');
  });

  it('contains no key-shaped property at any nesting depth', async () => {
    const { test } = await seedPublishedTest();
    const pkg = await getTestPackage(publicContext(harness.db), { code: test.code });

    const forbidden = ['isCorrect', 'answerKey', 'acceptedAnswers', 'correctText', 'correct'];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => {
          walk(child, `${path}[${String(i)}]`);
        });
        return;
      }
      if (node === null || typeof node !== 'object') return;

      for (const [key, value] of Object.entries(node)) {
        expect(forbidden, `leaked at ${path}.${key}`).not.toContain(key);
        walk(value, `${path}.${key}`);
      }
    };

    walk(pkg, 'package');
  });

  it('still ships everything a student legitimately needs', async () => {
    const { test } = await seedPublishedTest();
    const pkg = await getTestPackage(publicContext(harness.db), { code: test.code });

    expect(pkg.title).toBe('Photosynthesis');
    expect(pkg.timeLimitMinutes).toBe(30);
    expect(pkg.questions).toHaveLength(3);

    const choice = pkg.questions.find((q) => q.type === 'choice');
    expect(choice?.options).toHaveLength(2);
    expect(choice?.points).toBe(2);
  });
});

describe('getTestPackage › visibility', () => {
  it('reports an unpublished test as not found, not forbidden', async () => {
    // Distinguishing them would tell a stranger which codes are real.
    const org = await makeOrg(harness.db);
    const user = await makeUser(harness.db, org.id);
    const ctx = authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });
    const test = await createTest(ctx, {
      title: 'Draft',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });

    await expect(
      getTestPackage(publicContext(harness.db), { code: test.code }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reports an unknown code as not found', async () => {
    await expect(
      getTestPackage(publicContext(harness.db), { code: 'SCHOL-ZZZZZZ' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('accepts a lowercased code, because students type it by hand', async () => {
    const { test } = await seedPublishedTest();
    const pkg = await getTestPackage(publicContext(harness.db), {
      code: test.code.toLowerCase(),
    });
    expect(pkg.code).toBe(test.code);
  });

  it('refuses a test whose window has closed', async () => {
    const { test } = await seedPublishedTest();
    await updateTest(
      harness.db,
      test.id,
      { closesAt: new Date('2026-08-07T09:00:00.000Z') },
      new Date(),
    );

    await expect(
      getTestPackage(publicContext(harness.db), { code: test.code }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('refuses a test that has not opened yet', async () => {
    const { test } = await seedPublishedTest();
    await updateTest(
      harness.db,
      test.id,
      { opensAt: new Date('2026-08-07T11:00:00.000Z') },
      new Date(),
    );

    await expect(
      getTestPackage(publicContext(harness.db), { code: test.code }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });
});
