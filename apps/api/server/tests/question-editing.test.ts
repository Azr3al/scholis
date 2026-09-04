import { listKeyedQuestions } from '@/data/questions';
import type { AuthedContext } from '@/server/context.types';
import { authedContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { buildEvenSplitRubric, ShortGradingMode } from '@scholis/schema';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addQuestion } from './add-question';
import { createTest } from './create-test';
import { deleteQuestion } from './delete-question';
import { publishTest } from './publish-test';
import { updateQuestion } from './update-question';

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

const testInput = {
  title: 'Biology',
  timeLimitMinutes: null,
  allowNavigation: true,
  maxAttempts: 1,
};

const choice = (prompt: string, correct = 0) => ({
  type: 'choice' as const,
  body: text(prompt),
  points: 2,
  settings: { selection: 'single' as const, variant: 'plain' as const, rubric: null },
  options: [
    { body: text('A'), isCorrect: correct === 0 },
    { body: text('B'), isCorrect: correct === 1 },
  ],
});

describe('updateQuestion', () => {
  it('rewrites the prompt, the points and the answer key', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Old prompt') });

    const updated = await updateQuestion(ctx, {
      questionId: added.id,
      question: { ...choice('New prompt', 1), points: 5 },
    });

    expect(updated.points).toBe(5);

    // Read back rather than trusting the return value — the point is what a
    // student would actually be served.
    const [stored] = await listKeyedQuestions(ctx.db, test.id);
    expect(stored?.type).toBe('choice');
    if (stored?.type !== 'choice') throw new Error('expected a choice question');
    expect(stored.points).toBe(5);
    expect(stored.options.map((o) => o.isCorrect)).toEqual([false, true]);
  });

  it('keeps the question id and position, so nothing pointing at it breaks', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    await addQuestion(ctx, { testId: test.id, question: choice('First') });
    const second = await addQuestion(ctx, { testId: test.id, question: choice('Second') });

    const updated = await updateQuestion(ctx, {
      questionId: second.id,
      question: choice('Second, reworded'),
    });

    expect(updated.id).toBe(second.id);
    expect(updated.position).toBe(1);

    const stored = await listKeyedQuestions(ctx.db, test.id);
    expect(stored.map((q) => q.id)).toEqual([stored[0]?.id, second.id]);
  });

  it('replaces options rather than accumulating them', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Pick one') });

    await updateQuestion(ctx, { questionId: added.id, question: choice('Pick one') });

    const [stored] = await listKeyedQuestions(ctx.db, test.id);
    if (stored?.type !== 'choice') throw new Error('expected a choice question');
    // Four options here would mean the old pair was left behind.
    expect(stored.options).toHaveLength(2);
  });

  it('replaces short-answer keys rather than accumulating them', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const short = {
      type: 'short' as const,
      body: text('Capital of France?'),
      points: 1,
      settings: { gradingMode: ShortGradingMode.Rubric, caseSensitive: false },
      acceptedAnswers: ['Paris'],
    };
    const added = await addQuestion(ctx, { testId: test.id, question: short });

    await updateQuestion(ctx, {
      questionId: added.id,
      question: { ...short, acceptedAnswers: ['Paris', 'paris'] },
    });

    const [stored] = await listKeyedQuestions(ctx.db, test.id);
    if (stored?.type !== 'short') throw new Error('expected a short question');
    expect(stored.acceptedAnswers).toEqual(['Paris', 'paris']);
  });

  it('allows manual short questions without accepted answers while drafting', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const manual = {
      type: 'short' as const,
      body: text('Describe your method.'),
      points: 3,
      settings: { gradingMode: ShortGradingMode.Manual, caseSensitive: false },
      acceptedAnswers: [] as string[],
    };
    const added = await addQuestion(ctx, { testId: test.id, question: manual });

    await expect(
      updateQuestion(ctx, { questionId: added.id, question: manual }),
    ).resolves.toMatchObject({ type: 'short' });

    await expect(publishTest(ctx, { testId: test.id })).resolves.toMatchObject({
      status: 'published',
    });

    const [stored] = await listKeyedQuestions(ctx.db, test.id);
    if (stored?.type !== 'short') throw new Error('expected a short question');
    expect(stored.acceptedAnswers).toEqual([]);
    expect(stored.settings.gradingMode).toBe(ShortGradingMode.Manual);
  });

  it('rejects rubric short questions with no accepted answers on add', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);

    await expect(
      addQuestion(ctx, {
        testId: test.id,
        question: {
          type: 'short',
          body: text('Capital?'),
          points: 1,
          settings: { gradingMode: ShortGradingMode.Rubric, caseSensitive: false },
          acceptedAnswers: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('allows several correct options once the question is multi-answer', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Pick one') });

    // The exactly-one rule belongs to single-answer. Applying it here too would
    // leave multi-answer questions impossible to key.
    const updated = await updateQuestion(ctx, {
      questionId: added.id,
      question: {
        ...choice('Which of these are gases?'),
        settings: {
          selection: 'multi' as const,
          variant: 'plain' as const,
          rubric: buildEvenSplitRubric(2, 2),
        },
        options: [
          { body: text('Oxygen'), isCorrect: true },
          { body: text('Carbon dioxide'), isCorrect: true },
        ],
      },
    });

    expect(updated.id).toBe(added.id);

    const [stored] = await listKeyedQuestions(ctx.db, test.id);
    if (stored?.type !== 'choice') throw new Error('expected a choice question');
    expect(stored.options.filter((o) => o.isCorrect)).toHaveLength(2);
    expect(stored.settings.selection).toBe('multi');
    if (stored.settings.selection === 'multi') {
      expect(stored.settings.rubric).toEqual(buildEvenSplitRubric(2, 2));
    }
  });

  it('rejects a multi-answer question without a rubric when two options are correct', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Pick one') });

    await expect(
      updateQuestion(ctx, {
        questionId: added.id,
        question: {
          ...choice('Which are gases?'),
          settings: { selection: 'multi' as const, variant: 'plain' as const, rubric: null },
          options: [
            { body: text('Oxygen'), isCorrect: true },
            { body: text('Carbon dioxide'), isCorrect: true },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('rewrites an essay and its word bounds', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const essay = {
      type: 'essay' as const,
      body: text('Explain photosynthesis.'),
      points: 4,
      settings: { minWords: 50, maxWords: 200 },
    };
    const added = await addQuestion(ctx, { testId: test.id, question: essay });

    const updated = await updateQuestion(ctx, {
      questionId: added.id,
      question: { ...essay, points: 6, settings: { minWords: 80, maxWords: 300 } },
    });

    expect(updated.points).toBe(6);

    const [stored] = await listKeyedQuestions(ctx.db, test.id);
    if (stored?.type !== 'essay') throw new Error('expected an essay question');
    expect(stored.points).toBe(6);
    expect(stored.settings.minWords).toBe(80);
  });

  it('refuses to edit a published test', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Prompt') });
    await publishTest(ctx, { testId: test.id });

    await expect(
      updateQuestion(ctx, { questionId: added.id, question: choice('Changed') }),
    ).rejects.toThrow(/published/i);
  });

  it('refuses to change the question type', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Prompt') });

    await expect(
      updateQuestion(ctx, {
        questionId: added.id,
        question: {
          type: 'essay',
          body: text('Discuss'),
          points: 5,
          settings: { minWords: null, maxWords: null },
        },
      }),
    ).rejects.toThrow(/change its type/i);
  });

  it('allows saving a choice question with no correct option while drafting', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Prompt') });

    const none = choice('Prompt');
    none.options = none.options.map((o) => ({ ...o, isCorrect: false }));

    await expect(
      updateQuestion(ctx, { questionId: added.id, question: none }),
    ).resolves.toMatchObject({ type: 'choice' });

    await expect(publishTest(ctx, { testId: test.id })).rejects.toThrow(/incomplete/i);
  });

  it('allows two correct options on a single-answer question while drafting', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Prompt') });

    const both = choice('Prompt');
    both.options = both.options.map((o) => ({ ...o, isCorrect: true }));

    await expect(
      updateQuestion(ctx, { questionId: added.id, question: both }),
    ).resolves.toMatchObject({ type: 'choice' });

    await expect(publishTest(ctx, { testId: test.id })).rejects.toThrow(/incomplete/i);
  });

  it('hides a question belonging to another organisation', async () => {
    const mine = await seed();
    const theirs = await seed();
    const test = await createTest(theirs, testInput);
    const added = await addQuestion(theirs, { testId: test.id, question: choice('Theirs') });

    // notFound rather than forbidden: confirming the id exists would leak that
    // another organisation has it.
    await expect(
      updateQuestion(mine, { questionId: added.id, question: choice('Mine now') }),
    ).rejects.toThrow(/not found/i);
  });

  it('reports a question that does not exist', async () => {
    const ctx = await seed();
    await expect(
      updateQuestion(ctx, { questionId: randomUUID(), question: choice('Prompt') }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('deleteQuestion', () => {
  it('removes the question and closes the gap in positions', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const first = await addQuestion(ctx, { testId: test.id, question: choice('First') });
    const second = await addQuestion(ctx, { testId: test.id, question: choice('Second') });
    const third = await addQuestion(ctx, { testId: test.id, question: choice('Third') });

    await deleteQuestion(ctx, { questionId: second.id });

    const stored = await listKeyedQuestions(ctx.db, test.id);
    expect(stored.map((q) => q.id)).toEqual([first.id, third.id]);
    // Contiguous, not 0 and 2 — the next added question takes its position from
    // the count, so a gap would put two questions in the same slot.
    expect(stored.map((q) => q.position)).toEqual([0, 1]);
  });

  it('leaves room for a new question at the end after a delete', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const first = await addQuestion(ctx, { testId: test.id, question: choice('First') });
    const second = await addQuestion(ctx, { testId: test.id, question: choice('Second') });

    await deleteQuestion(ctx, { questionId: first.id });
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Third') });

    const stored = await listKeyedQuestions(ctx.db, test.id);
    expect(stored.map((q) => q.id)).toEqual([second.id, added.id]);
    expect(stored.map((q) => q.position)).toEqual([0, 1]);
  });

  it('takes the options with it', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Prompt') });

    await deleteQuestion(ctx, { questionId: added.id });

    expect(await listKeyedQuestions(ctx.db, test.id)).toHaveLength(0);
  });

  it('refuses to delete from a published test', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const added = await addQuestion(ctx, { testId: test.id, question: choice('Prompt') });
    await publishTest(ctx, { testId: test.id });

    await expect(deleteQuestion(ctx, { questionId: added.id })).rejects.toThrow(/published/i);
  });

  it('hides a question belonging to another organisation', async () => {
    const mine = await seed();
    const theirs = await seed();
    const test = await createTest(theirs, testInput);
    const added = await addQuestion(theirs, { testId: test.id, question: choice('Theirs') });

    await expect(deleteQuestion(mine, { questionId: added.id })).rejects.toThrow(/not found/i);

    // Still there — the refusal has to actually protect it, not just report.
    expect(await listKeyedQuestions(theirs.db, test.id)).toHaveLength(1);
  });
});
