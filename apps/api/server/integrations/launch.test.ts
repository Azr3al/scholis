import { updateTest } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { startAttempt } from '../attempts/start-attempt';
import { addQuestion } from '../tests/add-question';
import { createTest } from '../tests/create-test';
import { publishTest } from '../tests/publish-test';
import { launchAttempt } from './launch-attempt';

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

const ALL_SCOPES = ['tests:read', 'tests:write', 'results:read', 'launch:write'] as const;

const seed = async (scopes: readonly string[] = ALL_SCOPES) => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id, { role: 'owner' });

  const teacher: AuthedContext = authedContext(harness.db, {
    userId: user.id,
    orgId: org.id,
    role: 'owner',
  });

  const test = await createTest(teacher, {
    title: 'Reading and Use of English',
    timeLimitMinutes: null,
    allowNavigation: true,
    maxAttempts: 1,
  });

  await addQuestion(teacher, {
    testId: test.id,
    question: {
      type: 'short',
      body: text('Capital of France?'),
      points: 1,
      settings: { caseSensitive: false },
      acceptedAnswers: ['Paris'],
    },
  });
  await publishTest(teacher, { testId: test.id });

  // The machine acting for the same school, which is all a key ever is.
  const machine: AuthedContext = authedContext(harness.db, {
    userId: 'client-id',
    orgId: org.id,
    role: 'teacher',
    kind: 'client',
    scopes: [...scopes] as AuthedContext['actor']['scopes'],
  });

  return { teacher, machine, test, orgId: org.id };
};

const tokenFrom = (url: string): string => new URL(url).searchParams.get('lt') ?? '';

describe('minting a launch ticket', () => {
  it('produces a link carrying a token', async () => {
    const { machine, test } = await seed();

    const ticket = await launchAttempt(machine, {
      testId: test.id,
      takerRef: 'student-42',
      takerName: 'Bhone Myat Hein',
    });

    expect(ticket.url).toContain(`/take/${test.code}`);
    expect(tokenFrom(ticket.url)).not.toBe('');
  });

  it('refuses a key without the scope', async () => {
    const { machine, test } = await seed(['tests:read', 'results:read']);

    await expect(
      launchAttempt(machine, { testId: test.id, takerRef: 's1', takerName: 'Ada' }),
    ).rejects.toThrow(/cannot start attempts/i);
  });

  it('refuses a paper that is still a draft', async () => {
    const { teacher, machine } = await seed();
    const draft = await createTest(teacher, {
      title: 'Not ready',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });

    await expect(
      launchAttempt(machine, { testId: draft.id, takerRef: 's1', takerName: 'Ada' }),
    ).rejects.toThrow(/not published/i);
  });

  it('refuses another school\'s paper', async () => {
    const { test } = await seed();
    const otherOrg = await makeOrg(harness.db);
    const intruder = authedContext(harness.db, {
      userId: 'client-id',
      orgId: otherOrg.id,
      role: 'teacher',
      kind: 'client',
      scopes: ['launch:write'],
    });

    await expect(
      launchAttempt(intruder, { testId: test.id, takerRef: 's1', takerName: 'Ada' }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('redeeming a launch ticket', () => {
  it('takes identity from the ticket, not from the browser', async () => {
    // The reason identity travels inside the ticket at all. A name in a query
    // string is a name a student can edit on the way in.
    const { machine, test } = await seed();
    const ticket = await launchAttempt(machine, {
      testId: test.id,
      takerRef: 'student-42',
      takerName: 'Bhone Myat Hein',
    });

    const { attempt } = await startAttempt(publicContext(harness.db), {
      code: test.code,
      takerName: 'Somebody Else',
      takerRef: 'not-me',
      launchToken: tokenFrom(ticket.url),
    });

    expect(attempt.takerRef).toBe('student-42');
    expect(attempt.takerName).toBe('Bhone Myat Hein');
  });

  it('admits one student, not everyone the link was forwarded to', async () => {
    const { machine, test } = await seed();
    const ticket = await launchAttempt(machine, {
      testId: test.id,
      takerRef: 'student-42',
      takerName: 'Ada',
    });
    const token = tokenFrom(ticket.url);

    await startAttempt(publicContext(harness.db), {
      code: test.code,
      takerName: 'Ada',
      takerRef: null,
      launchToken: token,
    });

    await expect(
      startAttempt(publicContext(harness.db), {
        code: test.code,
        takerName: 'Ada',
        takerRef: null,
        launchToken: token,
      }),
    ).rejects.toThrow(/already been used/i);
  });

  it('refuses a ticket that has gone stale', async () => {
    const { machine, test } = await seed();
    const ticket = await launchAttempt(machine, {
      testId: test.id,
      takerRef: 'student-42',
      takerName: 'Ada',
    });

    // Twenty minutes later; a ticket lives fifteen.
    const later = publicContext(harness.db, new Date('2026-08-07T10:20:00.000Z'));
    await expect(
      startAttempt(later, {
        code: test.code,
        takerName: 'Ada',
        takerRef: null,
        launchToken: tokenFrom(ticket.url),
      }),
    ).rejects.toThrow(/used or has expired/i);
  });

  it('refuses a ticket minted for a different paper', async () => {
    const { teacher, machine, test } = await seed();

    const other = await createTest(teacher, {
      title: 'Another paper',
      timeLimitMinutes: null,
      allowNavigation: true,
      maxAttempts: 1,
    });
    await addQuestion(teacher, {
      testId: other.id,
      question: {
        type: 'short',
        body: text('Anything?'),
        points: 1,
        settings: { caseSensitive: false },
        acceptedAnswers: ['yes'],
      },
    });
    await publishTest(teacher, { testId: other.id });

    const ticket = await launchAttempt(machine, {
      testId: other.id,
      takerRef: 'student-42',
      takerName: 'Ada',
    });

    await expect(
      startAttempt(publicContext(harness.db), {
        code: test.code,
        takerName: 'Ada',
        takerRef: null,
        launchToken: tokenFrom(ticket.url),
      }),
    ).rejects.toThrow(/used or has expired/i);
  });

  it('still lets a student walk in with just a code', async () => {
    // Launching must not become the only way in. A paper shared by code is
    // how most of them are still sat.
    const { test } = await seed();

    const { attempt } = await startAttempt(publicContext(harness.db), {
      code: test.code,
      takerName: 'Walk-in Student',
      takerRef: null,
    });

    expect(attempt.takerName).toBe('Walk-in Student');
    expect(attempt.takerRef).toBeNull();
  });

  it('does not consume the ticket when the paper has closed', async () => {
    // A ticket burnt on a refusal would leave the student unable to retry once
    // a teacher reopened the paper, holding a link that is spent for nothing.
    const { machine, test, orgId } = await seed();
    const ticket = await launchAttempt(machine, {
      testId: test.id,
      takerRef: 'student-42',
      takerName: 'Ada',
    });

    await updateTest(
      harness.db,
      test.id,
      { closesAt: new Date('2026-08-07T09:00:00.000Z') },
      new Date('2026-08-07T09:00:00.000Z'),
    );
    expect(orgId).toBeTruthy();

    const token = tokenFrom(ticket.url);
    await expect(
      startAttempt(publicContext(harness.db), {
        code: test.code,
        takerName: 'Ada',
        takerRef: null,
        launchToken: token,
      }),
    ).rejects.toThrow(/closed/i);

    // The assertion that matters: the ticket survived being refused. Asserting
    // only the rejection above would pass whether or not it had been burnt.
    await updateTest(harness.db, test.id, { closesAt: null }, new Date('2026-08-07T09:30:00.000Z'));

    const { attempt } = await startAttempt(publicContext(harness.db), {
      code: test.code,
      takerName: 'Ada',
      takerRef: null,
      launchToken: token,
    });
    expect(attempt.takerRef).toBe('student-42');
  });
});
