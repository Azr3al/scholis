import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Executor } from '../executor.types';
import * as t from '../schema';
import { makeAttempt, makeChoiceQuestion, makeOrg, makeTest, makeUser } from './factories';
import { createTestDb, type TestDb } from './harness';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.reset();
});

/** Org + teacher + draft test, the starting point for most fixtures. */
const seedTest = async (db: Executor) => {
  const org = await makeOrg(db);
  const user = await makeUser(db, org.id);
  const test = await makeTest(db, { orgId: org.id, createdBy: user.id });
  return { org, user, test };
};

describe('test harness', () => {
  /**
   * Selecting from every table proves the migration applied. Deliberately not
   * an `information_schema` query via `db.execute` — that returns a bare array
   * on postgres-js and `{ rows }` on PGlite, so an assertion written against
   * one driver fails against the other. Drizzle's query builder normalises the
   * difference, which is why `data/` should use it rather than raw SQL.
   */
  it('applies every migration', async () => {
    const tables = [
      t.organizations,
      t.users,
      t.tests,
      t.questions,
      t.questionOptions,
      t.shortAnswerKeys,
      t.attempts,
      t.responses,
      t.mutations,
      t.events,
    ];

    for (const table of tables) {
      await expect(harness.db.select().from(table)).resolves.toEqual([]);
    }
  });

  it('reset empties tables between tests', async () => {
    await makeOrg(harness.db);
    expect(await harness.db.select().from(t.organizations)).toHaveLength(1);

    await harness.reset();
    expect(await harness.db.select().from(t.organizations)).toHaveLength(0);
  });

  it('rolls back a failed transaction', async () => {
    // Services own transaction boundaries, so this has to actually work.
    await expect(
      harness.db.transaction(async (tx) => {
        await makeOrg(tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await harness.db.select().from(t.organizations)).toHaveLength(0);
  });
});

describe('schema constraints', () => {
  it('builds a choice question with its options', async () => {
    const { test } = await seedTest(harness.db);
    const { question, options } = await makeChoiceQuestion(harness.db, test.id, {
      correctness: [true, false, false],
    });

    expect(question.type).toBe('choice');
    expect(options).toHaveLength(3);
    expect(options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  it('allows only one response per question per attempt', async () => {
    const { test } = await seedTest(harness.db);
    const { question } = await makeChoiceQuestion(harness.db, test.id);
    const attempt = await makeAttempt(harness.db, test.id);
    const value = { kind: 'choice', optionIds: ['a'] } satisfies t.ResponseRow['value'];

    await harness.db
      .insert(t.responses)
      .values({ attemptId: attempt.id, questionId: question.id, value });

    await expect(
      harness.db
        .insert(t.responses)
        .values({ attemptId: attempt.id, questionId: question.id, value }),
    ).rejects.toThrow();
  });

  it('treats a client-supplied mutation id as the idempotency key', async () => {
    const { test } = await seedTest(harness.db);
    const attempt = await makeAttempt(harness.db, test.id);
    const id = '11111111-1111-4111-8111-111111111111';

    await harness.db.insert(t.mutations).values({ id, attemptId: attempt.id });
    await harness.db
      .insert(t.mutations)
      .values({ id, attemptId: attempt.id })
      .onConflictDoNothing();

    expect(await harness.db.select().from(t.mutations)).toHaveLength(1);
  });

  it('cascades deletes from a test down to its questions and options', async () => {
    const { test } = await seedTest(harness.db);
    await makeChoiceQuestion(harness.db, test.id);

    await harness.db.delete(t.tests);

    expect(await harness.db.select().from(t.questions)).toHaveLength(0);
    expect(await harness.db.select().from(t.questionOptions)).toHaveLength(0);
  });

  it('refuses to delete an organisation that still has tests', async () => {
    // `restrict` rather than `cascade`: losing a school's entire assessment
    // history to one mis-click is not a recoverable mistake.
    const { org } = await seedTest(harness.db);
    await expect(harness.db.delete(t.organizations)).rejects.toThrow();
    expect(org.id).toBeTruthy();
  });

  it('numbers events monotonically per database', async () => {
    const { org } = await seedTest(harness.db);
    const rows = await harness.db
      .insert(t.events)
      .values([
        {
          orgId: org.id,
          type: 'test.published.v1',
          subjectType: 'test',
          subjectId: org.id,
          payload: {},
        },
        {
          orgId: org.id,
          type: 'attempt.submitted.v1',
          subjectType: 'attempt',
          subjectId: org.id,
          payload: {},
        },
      ])
      .returning();

    expect(rows).toHaveLength(2);
    expect(rows[1]?.seq).toBeGreaterThan(rows[0]?.seq ?? 0n);
  });
});
