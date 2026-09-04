import type { AuthedContext } from '@/server/context.types';
import { authedContext } from '@/test/support';
import { emptyRichText } from '@scholis/schema';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addDraftQuestions } from './add-draft-questions';
import { createTest } from './create-test';
import { publishTest } from './publish-test';
import { updateQuestion } from './update-question';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
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

describe('addDraftQuestions', () => {
  it('creates multiple empty draft questions of the selected kind', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);

    const created = await addDraftQuestions(ctx, {
      testId: test.id,
      kind: 'short' as const,
      count: 3,
    });

    expect(created).toHaveLength(3);
    expect(created.every((q) => q.type === 'short')).toBe(true);

    // flatMap rather than filter: TypeScript does not narrow a discriminated
    // union through .filter(), so the answer key would still be a field that
    // exists on only one member of it.
    const shorts = created.flatMap((q) => (q.type === 'short' ? [q] : []));
    expect(shorts.every((q) => q.acceptedAnswers.length === 0)).toBe(true);
  });
});

/** The one draft we asked for. Named rather than asserted, so a change in
 * how many are created fails with a sentence instead of a crash. */
const draftId = (draft: { id: string } | undefined): string => {
  if (draft === undefined) throw new Error('addDraftQuestions returned nothing');
  return draft.id;
};

describe('publish with draft questions', () => {
  it('rejects publish when any question is incomplete', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const [draft] = await addDraftQuestions(ctx, {
      testId: test.id,
      kind: 'essay' as const,
      count: 1,
    });

    await expect(publishTest(ctx, { testId: test.id })).rejects.toThrow(/incomplete/);

    await updateQuestion(ctx, {
      questionId: draftId(draft),
      question: {
        type: 'essay',
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Explain photosynthesis.' }],
            },
          ],
        },
        points: 2,
        settings: { minWords: null, maxWords: null },
      },
    });

    await expect(publishTest(ctx, { testId: test.id })).resolves.toMatchObject({
      status: 'published',
    });
  });

  it('allows saving an incomplete question while drafting', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const [draft] = await addDraftQuestions(ctx, {
      testId: test.id,
      kind: 'short' as const,
      count: 1,
    });

    const updated = await updateQuestion(ctx, {
      questionId: draftId(draft),
      question: {
        type: 'short',
        body: emptyRichText(),
        points: 1,
        settings: { caseSensitive: false },
        acceptedAnswers: [],
      },
    });

    // Asserted as a whole so the type is checked alongside the field, which
    // also saves narrowing the union by hand.
    expect(updated).toMatchObject({ type: 'short', acceptedAnswers: [] });
  });
});
