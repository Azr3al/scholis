import { findQuestionById } from '@/data/questions';
import {
  deleteSectionRow,
  findSectionForTest,
  insertSection,
  listSections,
  setQuestionSection,
  setSectionPositions,
  updateSectionRow,
} from '@/data/sections';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { invalidState, notFound, validationFailed } from '@/server/errors';
import { sectionSchema, richTextSchema, type Section } from '@scholis/schema';
import { z } from 'zod';

/**
 * Sections are headings, so their whole use case is one small CRUD unit rather
 * than four independent decisions. Kept in one file for that reason — they
 * share every guard (test belongs to the org, test is still a draft) and
 * splitting them would mean repeating those four times.
 */

const guard = async (ctx: AuthedContext, testId: string) => {
  const test = await findTestForOrg(ctx.db, testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');
  if (test.status !== 'draft') {
    throw invalidState('This test has been published and can no longer be edited.');
  }
  return test;
};

const toSection = (row: {
  id: string;
  title: string;
  description: unknown;
  position: number;
}): Section =>
  sectionSchema.parse({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    position: row.position,
  });

// --- create ----------------------------------------------------------------

export const createSectionInput = z.object({
  testId: z.uuid(),
  title: z.string().trim().max(200).default(''),
  description: richTextSchema.nullable().default(null),
});

export const createSection = async (
  ctx: AuthedContext,
  input: z.infer<typeof createSectionInput>,
): Promise<Section> => {
  await guard(ctx, input.testId);

  // Appended. Position comes from the current count rather than a client
  // guess, the same way a new question's does.
  const position = (await listSections(ctx.db, input.testId)).length;

  const row = await insertSection(ctx.db, {
    testId: input.testId,
    title: input.title,
    description: input.description,
    position,
  });
  return toSection(row);
};

// --- rename / describe -----------------------------------------------------

export const updateSectionInput = z.object({
  testId: z.uuid(),
  sectionId: z.uuid(),
  title: z.string().trim().max(200),
  description: richTextSchema.nullable(),
});

export const updateSection = async (
  ctx: AuthedContext,
  input: z.infer<typeof updateSectionInput>,
): Promise<Section> => {
  await guard(ctx, input.testId);

  // Looked up through the test, so a guessed id from another organisation is
  // not found rather than forbidden.
  const existing = await findSectionForTest(ctx.db, input.sectionId, input.testId);
  if (existing === null) throw notFound('Section');

  const row = await updateSectionRow(ctx.db, input.sectionId, {
    title: input.title,
    description: input.description,
  });
  return toSection(row);
};

// --- delete ----------------------------------------------------------------

export const deleteSectionInput = z.object({ testId: z.uuid(), sectionId: z.uuid() });

export const deleteSection = async (
  ctx: AuthedContext,
  input: z.infer<typeof deleteSectionInput>,
): Promise<{ deleted: true }> => {
  await guard(ctx, input.testId);

  const existing = await findSectionForTest(ctx.db, input.sectionId, input.testId);
  if (existing === null) throw notFound('Section');

  await ctx.db.transaction(async (tx) => {
    // Questions survive: the foreign key sets their section_id to null. Then
    // positions close up behind the removed heading, for the same reason a
    // deleted question's do — the next insert takes its position from a count.
    await deleteSectionRow(tx, input.sectionId);

    const remaining = await listSections(tx, input.testId);
    await setSectionPositions(
      tx,
      remaining.map((section, position) => ({ id: section.id, position })),
    );
  });

  return { deleted: true };
};

// --- reorder ---------------------------------------------------------------

export const reorderSectionsInput = z.object({
  testId: z.uuid(),
  sectionIds: z.array(z.uuid()).min(1),
});

export const reorderSections = async (
  ctx: AuthedContext,
  input: z.infer<typeof reorderSectionsInput>,
): Promise<{ sectionIds: string[] }> => {
  await guard(ctx, input.testId);

  const current = await listSections(ctx.db, input.testId);
  const currentIds = current.map((section) => section.id);

  // Same permutation check as question reordering: a stale client must not be
  // able to drop a heading by omitting it.
  const sameSet =
    currentIds.length === input.sectionIds.length &&
    new Set(input.sectionIds).size === input.sectionIds.length &&
    currentIds.every((id) => input.sectionIds.includes(id));

  if (!sameSet) throw validationFailed('That ordering does not match this test’s sections.');

  await ctx.db.transaction(async (tx) => {
    await setSectionPositions(
      tx,
      input.sectionIds.map((id, position) => ({ id, position })),
    );
  });

  return { sectionIds: input.sectionIds };
};

// --- assign a question -----------------------------------------------------

export const assignQuestionSectionInput = z.object({
  testId: z.uuid(),
  questionId: z.uuid(),
  /** null removes the question from any section. */
  sectionId: z.uuid().nullable(),
});

export const assignQuestionSection = async (
  ctx: AuthedContext,
  input: z.infer<typeof assignQuestionSectionInput>,
): Promise<{ questionId: string; sectionId: string | null }> => {
  await guard(ctx, input.testId);

  const question = await findQuestionById(ctx.db, input.questionId);
  if (question?.testId !== input.testId) throw notFound('Question');

  if (input.sectionId !== null) {
    const section = await findSectionForTest(ctx.db, input.sectionId, input.testId);
    if (section === null) throw notFound('Section');
  }

  await setQuestionSection(ctx.db, input.questionId, input.sectionId);
  return { questionId: input.questionId, sectionId: input.sectionId };
};
