import type { AuthedContext } from '@/server/context.types';
import { authedContext } from '@/test/support';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTest } from './create-test';
import { getTest } from './get-test';
import { listTests } from './list-tests';
import { createTag, deleteTag, listTags, setTestTags, updateTag } from './manage-tags';

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

const testInput = { title: 'Biology', timeLimitMinutes: null, allowNavigation: true, maxAttempts: 1 };

describe('tags', () => {
  it('creates tags in order and rejects duplicate names case-insensitively', async () => {
    const ctx = await seed();
    const first = await createTag(ctx, { name: 'Midterm' });
    const second = await createTag(ctx, { name: 'Final' });

    expect(first.name).toBe('Midterm');
    expect(second.name).toBe('Final');
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);

    await expect(createTag(ctx, { name: 'midterm' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('lists org tags ordered by position', async () => {
    const ctx = await seed();
    await createTag(ctx, { name: 'A' });
    await createTag(ctx, { name: 'B' });

    const tags = await listTags(ctx);
    expect(tags.map((tag) => tag.name)).toEqual(['A', 'B']);
  });

  it('assigns tags on a test and replaces the full set', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const alpha = await createTag(ctx, { name: 'Alpha' });
    const beta = await createTag(ctx, { name: 'Beta' });

    await setTestTags(ctx, { testId: test.id, tagIds: [alpha.id, beta.id] });

    let detail = await getTest(ctx, { testId: test.id });
    expect(detail.tags.map((tag) => tag.name).sort()).toEqual(['Alpha', 'Beta']);

    await setTestTags(ctx, { testId: test.id, tagIds: [beta.id] });
    detail = await getTest(ctx, { testId: test.id });
    expect(detail.tags.map((tag) => tag.name)).toEqual(['Beta']);
  });

  it('includes tags on listTests summaries', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const tag = await createTag(ctx, { name: 'Science' });
    await setTestTags(ctx, { testId: test.id, tagIds: [tag.id] });

    const summaries = await listTests(ctx);
    expect(summaries[0]?.tags).toEqual([{ id: tag.id, name: 'Science' }]);
  });

  it('deletes a tag and keeps tests; assignments cascade', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const tag = await createTag(ctx, { name: 'Temp' });
    await setTestTags(ctx, { testId: test.id, tagIds: [tag.id] });

    await deleteTag(ctx, { tagId: tag.id });

    const detail = await getTest(ctx, { testId: test.id });
    expect(detail.tags).toEqual([]);
    expect(await listTags(ctx)).toEqual([]);
  });

  it('renames a tag and updates summaries', async () => {
    const ctx = await seed();
    const test = await createTest(ctx, testInput);
    const tag = await createTag(ctx, { name: 'Old name' });
    await setTestTags(ctx, { testId: test.id, tagIds: [tag.id] });

    const updated = await updateTag(ctx, { tagId: tag.id, name: 'New name' });
    expect(updated.name).toBe('New name');

    const detail = await getTest(ctx, { testId: test.id });
    expect(detail.tags).toEqual([{ id: tag.id, name: 'New name' }]);

    const summaries = await listTests(ctx);
    expect(summaries[0]?.tags).toEqual([{ id: tag.id, name: 'New name' }]);
  });

  it('rejects rename to duplicate name case-insensitively', async () => {
    const ctx = await seed();
    const first = await createTag(ctx, { name: 'Alpha' });
    const second = await createTag(ctx, { name: 'Beta' });

    await expect(updateTag(ctx, { tagId: second.id, name: 'alpha' })).rejects.toMatchObject({
      code: 'validation_failed',
    });

    const unchanged = await listTags(ctx);
    expect(unchanged.find((tag) => tag.id === first.id)?.name).toBe('Alpha');
  });

  it('returns not found when renaming a tag from another org', async () => {
    const orgA = await makeOrg(harness.db);
    const userA = await makeUser(harness.db, orgA.id);
    const ctxA = authedContext(harness.db, { userId: userA.id, orgId: orgA.id, role: 'teacher' });

    const orgB = await makeOrg(harness.db);
    const userB = await makeUser(harness.db, orgB.id);
    const ctxB = authedContext(harness.db, { userId: userB.id, orgId: orgB.id, role: 'teacher' });

    const tagA = await createTag(ctxA, { name: 'Mine' });

    await expect(updateTag(ctxB, { tagId: tagA.id, name: 'Stolen' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('isolates tags across organizations', async () => {
    const orgA = await makeOrg(harness.db);
    const userA = await makeUser(harness.db, orgA.id);
    const ctxA = authedContext(harness.db, { userId: userA.id, orgId: orgA.id, role: 'teacher' });

    const orgB = await makeOrg(harness.db);
    const userB = await makeUser(harness.db, orgB.id);
    const ctxB = authedContext(harness.db, { userId: userB.id, orgId: orgB.id, role: 'teacher' });

    const tagA = await createTag(ctxA, { name: 'Shared name' });
    await createTag(ctxB, { name: 'Shared name' });

    const testB = await createTest(ctxB, testInput);
    await expect(setTestTags(ctxB, { testId: testB.id, tagIds: [tagA.id] })).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });
});
