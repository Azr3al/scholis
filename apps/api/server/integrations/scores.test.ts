import { updateTest } from '@/data/tests';
import type { AuthedContext, PublicContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMutations } from '../attempts/apply-mutations';
import { startAttempt } from '../attempts/start-attempt';
import { submitAttempt } from '../attempts/submit-attempt';
import { releaseResults } from '../grading/release-results';
import { addQuestion } from '../tests/add-question';
import { createTest } from '../tests/create-test';
import { createSection } from '../tests/manage-sections';
import { assignQuestionSection } from '../tests/manage-sections';
import { publishTest } from '../tests/publish-test';
import { listScores } from './list-scores';

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

/**
 * A paper shaped like a real one: two sections that a gradebook would combine
 * into a single "Reading and Use of English" column.
 */
const seed = async () => {
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
    maxAttempts: 5,
  });

  const reading = await createSection(teacher, {
    testId: test.id,
    title: 'Reading',
    description: null,
  });
  const useOfEnglish = await createSection(teacher, {
    testId: test.id,
    title: 'Use of English',
    description: null,
  });

  const q1 = await addQuestion(teacher, {
    testId: test.id,
    question: {
      type: 'short',
      body: text('Capital of France?'),
      points: 3,
      settings: { caseSensitive: false },
      acceptedAnswers: ['Paris'],
    },
  });
  const q2 = await addQuestion(teacher, {
    testId: test.id,
    question: {
      type: 'short',
      body: text('Past tense of go?'),
      points: 2,
      settings: { caseSensitive: false },
      acceptedAnswers: ['went'],
    },
  });

  await assignQuestionSection(teacher, {
    testId: test.id,
    questionId: q1.id,
    sectionId: reading.id,
  });
  await assignQuestionSection(teacher, {
    testId: test.id,
    questionId: q2.id,
    sectionId: useOfEnglish.id,
  });

  await updateTest(harness.db, test.id, { courseRef: 'course-7B' }, new Date());
  await publishTest(teacher, { testId: test.id });

  const machine: AuthedContext = authedContext(harness.db, {
    userId: 'client-id',
    orgId: org.id,
    role: 'teacher',
    kind: 'client',
    scopes: ['results:read'],
  });

  return { teacher, machine, test, orgId: org.id, questions: { q1, q2 } };
};

/** Sit the paper, answer the first question correctly, hand in. */
const sit = async (
  code: string,
  takerName: string,
  takerRef: string | null,
  questionId: string,
  answer: string,
) => {
  const take: PublicContext = publicContext(harness.db);
  const { attempt, token } = await startAttempt(take, { code, takerName, takerRef });

  await applyMutations(take, {
    attemptId: attempt.id,
    token,
    mutations: [
      {
        kind: 'answer',
        id: randomUUID(),
        attemptId: attempt.id,
        questionId,
        value: { kind: 'short', doc: text(answer) },
        clientSeq: 1,
        at: new Date().toISOString(),
      },
    ],
  });

  await submitAttempt(take, { attemptId: attempt.id, token });
  return attempt.id;
};

describe('reading scores', () => {
  it('says nothing until the teacher releases', async () => {
    // The property that matters most here. Report cards are emailed to
    // parents, and a mark reaching one before marking is finished is not a
    // mistake anybody gets to explain away.
    const { machine, test, questions } = await seed();
    await sit(test.code, 'Ada', 'student-1', questions.q1.id, 'Paris');

    expect(await listScores(machine, {})).toEqual([]);
  });

  it('reports a released attempt with its marks per section', async () => {
    const { teacher, machine, test, questions } = await seed();
    await sit(test.code, 'Ada', 'student-1', questions.q1.id, 'Paris');
    await releaseResults(teacher, { testId: test.id });

    const [row] = await listScores(machine, {});

    expect(row?.studentRef).toBe('student-1');
    expect(row?.takerName).toBe('Ada');
    expect(row?.courseRef).toBe('course-7B');
    // Three of five: the Reading question right, Use of English unanswered.
    expect(row?.score).toBe(3);
    expect(row?.maxScore).toBe(5);

    const sections = [...(row?.sections ?? [])]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(({ title, score, maxScore }) => ({ title, score, maxScore }));
    expect(sections).toEqual([
      { title: 'Reading', score: 3, maxScore: 3 },
      { title: 'Use of English', score: 0, maxScore: 2 },
    ]);

    // Each section is identified, so a caller can map one to a gradebook column.
    expect((row?.sections ?? []).every((s) => typeof s.sectionId === 'string')).toBe(true);
  });

  it('hands over raw marks and never a grade', async () => {
    // Grade boundaries are school policy that changes yearly. Scholis
    // returning a "B" would be asserting a rule it cannot know.
    const { teacher, machine, test, questions } = await seed();
    await sit(test.code, 'Ada', 'student-1', questions.q1.id, 'Paris');
    await releaseResults(teacher, { testId: test.id });

    const [row] = await listScores(machine, {});
    const keys = Object.keys(row ?? {});
    expect(keys).not.toContain('grade');
    expect(keys).not.toContain('percentage');
  });

  it('filters to one course', async () => {
    const { teacher, machine, test, questions } = await seed();
    await sit(test.code, 'Ada', 'student-1', questions.q1.id, 'Paris');
    await releaseResults(teacher, { testId: test.id });

    expect(await listScores(machine, { courseRef: 'course-7B' })).toHaveLength(1);
    expect(await listScores(machine, { courseRef: 'course-8A' })).toHaveLength(0);
  });

  it('returns one row per student', async () => {
    const { teacher, machine, test, questions } = await seed();
    await sit(test.code, 'Ada', 'student-1', questions.q1.id, 'Paris');
    await sit(test.code, 'Grace', 'student-2', questions.q1.id, 'Lyon');
    await releaseResults(teacher, { testId: test.id });

    const rows = await listScores(machine, {});
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.studentRef).sort()).toEqual(['student-1', 'student-2']);

    // And the wrong answer scores zero rather than going missing.
    const grace = rows.find((r) => r.studentRef === 'student-2');
    expect(grace?.score).toBe(0);
  });

  it('refuses a key without the scope', async () => {
    const { machine, orgId } = await seed();
    const narrow = authedContext(harness.db, {
      userId: machine.actor.userId,
      orgId,
      role: 'teacher',
      kind: 'client',
      scopes: ['tests:read'],
    });

    await expect(listScores(narrow, {})).rejects.toThrow(/cannot read results/i);
  });

  it('shows one school nothing of another', async () => {
    const { teacher, test, questions } = await seed();
    await sit(test.code, 'Ada', 'student-1', questions.q1.id, 'Paris');
    await releaseResults(teacher, { testId: test.id });

    const otherOrg = await makeOrg(harness.db);
    const intruder = authedContext(harness.db, {
      userId: 'client-id',
      orgId: otherOrg.id,
      role: 'teacher',
      kind: 'client',
      scopes: ['results:read'],
    });

    expect(await listScores(intruder, {})).toEqual([]);
  });
});
