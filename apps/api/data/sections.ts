import { questions, sections, type Executor, type SectionRow } from '@scholis/db';
import type { RichText } from '@scholis/schema';
import { and, asc, eq } from 'drizzle-orm';

export type SectionRecord = SectionRow;

export const listSections = async (db: Executor, testId: string): Promise<SectionRecord[]> =>
  db
    .select()
    .from(sections)
    .where(eq(sections.testId, testId))
    .orderBy(asc(sections.position), asc(sections.id));

export const findSectionForTest = async (
  db: Executor,
  sectionId: string,
  testId: string,
): Promise<SectionRecord | null> => {
  const [row] = await db
    .select()
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.testId, testId)))
    .limit(1);
  return row ?? null;
};

export const insertSection = async (
  db: Executor,
  values: { testId: string; title: string; description: RichText | null; position: number },
): Promise<SectionRecord> => {
  const [row] = await db.insert(sections).values(values).returning();
  if (row === undefined) throw new Error('Insert into sections returned no rows');
  return row;
};

export const updateSectionRow = async (
  db: Executor,
  sectionId: string,
  values: { title?: string; description?: RichText | null },
): Promise<SectionRecord> => {
  const [row] = await db.update(sections).set(values).where(eq(sections.id, sectionId)).returning();
  if (row === undefined) throw new Error('Update of sections returned no rows');
  return row;
};

/**
 * Deleting a heading must not delete the questions under it.
 *
 * The foreign key is ON DELETE SET NULL, so they simply become unsectioned and
 * keep their place in the test. Losing a paper's questions because someone
 * renamed the structure would be unforgivable.
 */
export const deleteSectionRow = async (db: Executor, sectionId: string): Promise<void> => {
  await db.delete(sections).where(eq(sections.id, sectionId));
};

/** Positions rewritten wholesale; the caller supplies the final order. */
export const setSectionPositions = async (
  db: Executor,
  ordered: { id: string; position: number }[],
): Promise<void> => {
  for (const { id, position } of ordered) {
    await db.update(sections).set({ position }).where(eq(sections.id, id));
  }
};

export const setQuestionSection = async (
  db: Executor,
  questionId: string,
  sectionId: string | null,
): Promise<void> => {
  await db.update(questions).set({ sectionId }).where(eq(questions.id, questionId));
};
