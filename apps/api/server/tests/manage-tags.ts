import {
  countTagsByOrg,
  deleteTagRow,
  findTagByOrg,
  findTagByOrgAndName,
  insertTag,
  listTagsByOrg,
  setTestTagAssignments,
  updateTagName,
  verifyTagsBelongToOrg,
  type TagRecord,
} from '@/data/tags';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { notFound, validationFailed } from '@/server/errors';
import { testTagSchema, type TestTag } from '@scholis/contracts';
import { z } from 'zod';

const toTag = (row: TagRecord): TestTag =>
  testTagSchema.parse({ id: row.id, name: row.name, position: row.position });

export const listTags = async (ctx: AuthedContext): Promise<TestTag[]> => {
  const rows = await listTagsByOrg(ctx.db, ctx.actor.orgId);
  return rows.map(toTag);
};

export const createTagInput = z.object({
  name: z.string().trim().min(1).max(50),
});

export const createTag = async (
  ctx: AuthedContext,
  input: z.infer<typeof createTagInput>,
): Promise<TestTag> => {
  const name = input.name.trim();
  const existing = await findTagByOrgAndName(ctx.db, ctx.actor.orgId, name);
  if (existing !== null) {
    throw validationFailed('A tag with that name already exists.');
  }

  const position = await countTagsByOrg(ctx.db, ctx.actor.orgId);
  const row = await insertTag(ctx.db, ctx.actor.orgId, name, position);
  return toTag(row);
};

export const updateTagInput = z.object({
  tagId: z.uuid(),
  name: z.string().trim().min(1).max(50),
});

export const updateTag = async (
  ctx: AuthedContext,
  input: z.infer<typeof updateTagInput>,
): Promise<TestTag> => {
  const tag = await findTagByOrg(ctx.db, ctx.actor.orgId, input.tagId);
  if (tag === null) throw notFound('Tag');

  const name = input.name.trim();
  const existing = await findTagByOrgAndName(ctx.db, ctx.actor.orgId, name);
  if (existing !== null && existing.id !== input.tagId) {
    throw validationFailed('A tag with that name already exists.');
  }

  const row = await updateTagName(ctx.db, ctx.actor.orgId, input.tagId, name);
  return toTag(row);
};

export const deleteTagInput = z.object({ tagId: z.uuid() });

export const deleteTag = async (
  ctx: AuthedContext,
  input: z.infer<typeof deleteTagInput>,
): Promise<{ deleted: true }> => {
  const tag = await findTagByOrg(ctx.db, ctx.actor.orgId, input.tagId);
  if (tag === null) throw notFound('Tag');

  await deleteTagRow(ctx.db, input.tagId);
  return { deleted: true };
};

export const setTestTagsInput = z.object({
  testId: z.uuid(),
  tagIds: z.array(z.uuid()),
});

export const setTestTags = async (
  ctx: AuthedContext,
  input: z.infer<typeof setTestTagsInput>,
): Promise<{ testId: string; tagIds: string[] }> => {
  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');

  const ok = await verifyTagsBelongToOrg(ctx.db, ctx.actor.orgId, input.tagIds);
  if (!ok) {
    throw validationFailed('One or more tags do not belong to this organization.');
  }

  await setTestTagAssignments(ctx.db, input.testId, input.tagIds);
  return { testId: input.testId, tagIds: input.tagIds };
};
