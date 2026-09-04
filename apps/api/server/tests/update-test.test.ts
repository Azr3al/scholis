import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { authedContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { emptyRichText } from '@scholis/schema';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTest } from './create-test';
import { publishTest } from './publish-test';
import { updateTestSettings } from './update-test';

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

const createInput = {
  title: 'Biology',
  timeLimitMinutes: null as number | null,
  allowNavigation: true,
  maxAttempts: 1,
};

const settingsPatch = {
  introBody: emptyRichText(),
  outroBody: emptyRichText(),
  randomizeQuestionOrder: false,
};

describe('updateTestSettings', () => {
  it('updates title and timing settings on a draft', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, createInput);

    const updated = await updateTestSettings(ctx, {
      testId: test.id,
      title: 'Chemistry',
      timeLimitMinutes: 90,
      allowNavigation: false,
      maxAttempts: 3,
      ...settingsPatch,
    });

    expect(updated.title).toBe('Chemistry');
    expect(updated.timeLimitMinutes).toBe(90);
    expect(updated.allowNavigation).toBe(false);
    expect(updated.maxAttempts).toBe(3);

    const stored = await findTestForOrg(ctx.db, test.id, ctx.actor.orgId);
    expect(stored?.title).toBe('Chemistry');
    expect(stored?.timeLimitMinutes).toBe(90);
    expect(stored?.allowNavigation).toBe(false);
    expect(stored?.maxAttempts).toBe(3);
  });

  it('refuses edits after publish', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, {
      ...createInput,
      title: 'Paper',
    });

    // Publish needs at least one question — add via direct insert is heavy;
    // use the same path as publish-test tests.
    const { addQuestion } = await import('./add-question');
    await addQuestion(ctx, {
      testId: test.id,
      question: {
        type: 'short',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q?' }] }],
        },
        points: 1,
        settings: { caseSensitive: false },
        acceptedAnswers: ['yes'],
      },
    });
    await publishTest(ctx, { testId: test.id });

    await expect(
      updateTestSettings(ctx, {
        testId: test.id,
        title: 'Renamed',
        timeLimitMinutes: 60,
        allowNavigation: true,
        maxAttempts: 2,
        ...settingsPatch,
      }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('persists intro and randomize settings on a draft', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, createInput);
    const intro = {
      type: 'doc' as const,
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Read carefully.' }] }],
    };

    await updateTestSettings(ctx, {
      testId: test.id,
      title: test.title,
      timeLimitMinutes: test.timeLimitMinutes,
      allowNavigation: test.allowNavigation,
      maxAttempts: test.maxAttempts,
      introBody: intro,
      outroBody: emptyRichText(),
      randomizeQuestionOrder: true,
    });

    const stored = await findTestForOrg(ctx.db, test.id, ctx.actor.orgId);
    expect(stored?.introBody).toEqual(intro);
    expect(stored?.randomizeQuestionOrder).toBe(true);
  });

  it('persists outro on a draft', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, createInput);
    const outro = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: 'Thanks for sitting this paper.' }],
        },
      ],
    };

    await updateTestSettings(ctx, {
      testId: test.id,
      title: test.title,
      timeLimitMinutes: test.timeLimitMinutes,
      allowNavigation: test.allowNavigation,
      maxAttempts: test.maxAttempts,
      introBody: emptyRichText(),
      outroBody: outro,
      randomizeQuestionOrder: false,
    });

    const stored = await findTestForOrg(ctx.db, test.id, ctx.actor.orgId);
    expect(stored?.outroBody).toEqual(outro);
  });
});
