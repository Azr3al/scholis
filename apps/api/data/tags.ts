import { testTagAssignments, testTags, type Executor, type TestTagRow } from '@scholis/db';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

export type TagRecord = TestTagRow;

export interface TagSummary {
  id: string;
  name: string;
}

export const listTagsByOrg = async (db: Executor, orgId: string): Promise<TagRecord[]> =>
  db
    .select()
    .from(testTags)
    .where(eq(testTags.orgId, orgId))
    .orderBy(asc(testTags.position), asc(testTags.name));

export const findTagByOrg = async (
  db: Executor,
  orgId: string,
  tagId: string,
): Promise<TagRecord | null> => {
  const [row] = await db
    .select()
    .from(testTags)
    .where(and(eq(testTags.id, tagId), eq(testTags.orgId, orgId)))
    .limit(1);
  return row ?? null;
};

export const findTagByOrgAndName = async (
  db: Executor,
  orgId: string,
  name: string,
): Promise<TagRecord | null> => {
  const trimmed = name.trim();
  const [row] = await db
    .select()
    .from(testTags)
    .where(and(eq(testTags.orgId, orgId), sql`lower(${testTags.name}) = lower(${trimmed})`))
    .limit(1);
  return row ?? null;
};

export const insertTag = async (
  db: Executor,
  orgId: string,
  name: string,
  position: number,
): Promise<TagRecord> => {
  const [row] = await db.insert(testTags).values({ orgId, name, position }).returning();
  if (row === undefined) throw new Error('Insert into test_tags returned no rows');
  return row;
};

export const deleteTagRow = async (db: Executor, tagId: string): Promise<void> => {
  await db.delete(testTags).where(eq(testTags.id, tagId));
};

export const updateTagName = async (
  db: Executor,
  orgId: string,
  tagId: string,
  name: string,
): Promise<TagRecord> => {
  const trimmed = name.trim();
  const [row] = await db
    .update(testTags)
    .set({ name: trimmed })
    .where(and(eq(testTags.id, tagId), eq(testTags.orgId, orgId)))
    .returning();
  if (row === undefined) throw new Error('Update test_tags returned no rows');
  return row;
};

export const listTagsForTests = async (
  db: Executor,
  testIds: string[],
): Promise<Map<string, TagSummary[]>> => {
  const result = new Map<string, TagSummary[]>();
  if (testIds.length === 0) return result;

  for (const id of testIds) {
    result.set(id, []);
  }

  const rows = await db
    .select({
      testId: testTagAssignments.testId,
      tagId: testTags.id,
      tagName: testTags.name,
    })
    .from(testTagAssignments)
    .innerJoin(testTags, eq(testTagAssignments.tagId, testTags.id))
    .where(inArray(testTagAssignments.testId, testIds))
    .orderBy(asc(testTags.position), asc(testTags.name));

  for (const row of rows) {
    const tags = result.get(row.testId);
    // Seeded for every requested id above, so a miss can only be a row for a
    // test the caller did not ask about — nothing to do with it here.
    if (tags === undefined) continue;
    tags.push({ id: row.tagId, name: row.tagName });
  }

  return result;
};

export const listTagsForTest = async (db: Executor, testId: string): Promise<TagSummary[]> => {
  const map = await listTagsForTests(db, [testId]);
  return map.get(testId) ?? [];
};

export const setTestTagAssignments = async (
  db: Executor,
  testId: string,
  tagIds: string[],
): Promise<void> => {
  await db.delete(testTagAssignments).where(eq(testTagAssignments.testId, testId));
  if (tagIds.length === 0) return;
  await db.insert(testTagAssignments).values(tagIds.map((tagId) => ({ testId, tagId })));
};

export const verifyTagsBelongToOrg = async (
  db: Executor,
  orgId: string,
  tagIds: string[],
): Promise<boolean> => {
  if (tagIds.length === 0) return true;
  const unique = [...new Set(tagIds)];
  const rows = await db
    .select({ id: testTags.id })
    .from(testTags)
    .where(and(eq(testTags.orgId, orgId), inArray(testTags.id, unique)));
  return rows.length === unique.length;
};

export const countTagsByOrg = async (db: Executor, orgId: string): Promise<number> => {
  const rows = await db.select({ id: testTags.id }).from(testTags).where(eq(testTags.orgId, orgId));
  return rows.length;
};
