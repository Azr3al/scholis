import { listKeyedQuestions } from '@/data/questions';
import { listSections } from '@/data/sections';
import type { AuthedContext } from '@/server/context.types';
import { authedContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addQuestion } from './add-question';
import { createTest } from './create-test';
import {
  assignQuestionSection,
  createSection,
  deleteSection,
  reorderSections,
  updateSection,
} from './manage-sections';
import { publishTest } from './publish-test';

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

const seed = async (): Promise<AuthedContext> => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id);
  return authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'teacher' });
};

const testInput = { title: 'Biology', timeLimitMinutes: null, allowNavigation: true, maxAttempts: 1 };

const choice = (prompt: string) => ({
  type: 'choice' as const,
  body: text(prompt),
  points: 1,
  settings: { selection: 'single' as const, variant: 'plain' as const, rubric: null, partialCredit: false },
  options: [
    { body: text('A'), isCorrect: true },
    { body: text('B'), isCorrect: false },
  ],
});

describe('sections', () => {
  it('appends new sections in order', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);

    const first = await createSection(ctx, { testId: test.id, title: 'Part A', description: null });
    const second = await createSection(ctx, { testId: test.id, title: 'Part B', description: null });

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
  });

  it('renames without disturbing anything else', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const section = await createSection(ctx, { testId: test.id, title: 'Old', description: null });

    const renamed = await updateSection(ctx, {
      testId: test.id,
      sectionId: section.id,
      title: 'New',
      description: text('Read carefully.'),
    });

    expect(renamed.id).toBe(section.id);
    expect(renamed.title).toBe('New');
    expect(renamed.description).not.toBeNull();
  });

  it('reorders, and refuses an ordering that is not a permutation', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const a = await createSection(ctx, { testId: test.id, title: 'A', description: null });
    const b = await createSection(ctx, { testId: test.id, title: 'B', description: null });

    await reorderSections(ctx, { testId: test.id, sectionIds: [b.id, a.id] });
    expect((await listSections(ctx.db, test.id)).map((s) => s.title)).toEqual(['B', 'A']);

    // A stale client omitting one must not be able to drop it.
    await expect(reorderSections(ctx, { testId: test.id, sectionIds: [a.id] })).rejects.toThrow(
      /does not match/i,
    );
  });

  it('keeps the questions when a section is deleted', async () => {
    // The thing a teacher will be most afraid of. Deleting a heading must not
    // delete a paper.
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const section = await createSection(ctx, { testId: test.id, title: 'Part A', description: null });
    const question = await addQuestion(ctx, { testId: test.id, question: choice('Q1') });

    await assignQuestionSection(ctx, {
      testId: test.id,
      questionId: question.id,
      sectionId: section.id,
    });

    await deleteSection(ctx, { testId: test.id, sectionId: section.id });

    const remaining = await listKeyedQuestions(ctx.db, test.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(question.id);
    expect(remaining[0]?.sectionId).toBeNull();
  });

  it('closes the gap in positions after a delete', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const a = await createSection(ctx, { testId: test.id, title: 'A', description: null });
    await createSection(ctx, { testId: test.id, title: 'B', description: null });

    await deleteSection(ctx, { testId: test.id, sectionId: a.id });

    const left = await listSections(ctx.db, test.id);
    expect(left.map((s) => ({ title: s.title, position: s.position }))).toEqual([
      { title: 'B', position: 0 },
    ]);
  });

  it('assigns and unassigns a question', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const section = await createSection(ctx, { testId: test.id, title: 'A', description: null });
    const question = await addQuestion(ctx, { testId: test.id, question: choice('Q1') });

    await assignQuestionSection(ctx, {
      testId: test.id,
      questionId: question.id,
      sectionId: section.id,
    });
    expect((await listKeyedQuestions(ctx.db, test.id))[0]?.sectionId).toBe(section.id);

    await assignQuestionSection(ctx, {
      testId: test.id,
      questionId: question.id,
      sectionId: null,
    });
    expect((await listKeyedQuestions(ctx.db, test.id))[0]?.sectionId).toBeNull();
  });

  it('refuses to edit sections once the test is published', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    await addQuestion(ctx, { testId: test.id, question: choice('Q1') });
    await publishTest(ctx, { testId: test.id });

    await expect(
      createSection(ctx, { testId: test.id, title: 'Late', description: null }),
    ).rejects.toThrow(/published/i);
  });

  it('hides another organisation’s test', async () => {
    const mine = await seed();
    const theirs = await seed();
    const test = await createTest(theirs, testInput);

    await expect(
      createSection(mine, { testId: test.id, title: 'A', description: null }),
    ).rejects.toThrow(/not found/i);
  });

  it('leaves a test with no sections exactly as it was', async () => {
    // The compatibility guarantee: every existing paper keeps working.
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    await addQuestion(ctx, { testId: test.id, question: choice('Q1') });

    expect(await listSections(ctx.db, test.id)).toEqual([]);
    expect((await listKeyedQuestions(ctx.db, test.id))[0]?.sectionId).toBeNull();
  });
});
