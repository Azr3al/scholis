import { tests, type Executor, type NewTestRow, type TestRow } from '@scholis/db';
import { and, desc, eq } from 'drizzle-orm';

/**
 * Tests carry no `numeric` columns, so the row shape is already the domain
 * shape and there is nothing to translate. The alias exists so services never
 * name a `*Row` type: the day this table grows a column that does need mapping,
 * this becomes a real mapper and no service changes.
 */
export type TestRecord = TestRow;

export const findTestById = async (db: Executor, id: string): Promise<TestRecord | null> => {
  const [row] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  return row ?? null;
};

/**
 * Scoped by organisation.
 *
 * The scoping is a query predicate, not an authorisation decision — a service
 * decides that org isolation is required; this just makes the scoped read the
 * easy one to reach for.
 */
export const findTestForOrg = async (
  db: Executor,
  id: string,
  orgId: string,
): Promise<TestRecord | null> => {
  const [row] = await db
    .select()
    .from(tests)
    .where(and(eq(tests.id, id), eq(tests.orgId, orgId)))
    .limit(1);
  return row ?? null;
};

export const findTestByCode = async (db: Executor, code: string): Promise<TestRecord | null> => {
  const [row] = await db.select().from(tests).where(eq(tests.code, code)).limit(1);
  return row ?? null;
};

export const listTestsForOrg = async (db: Executor, orgId: string): Promise<TestRecord[]> =>
  db.select().from(tests).where(eq(tests.orgId, orgId)).orderBy(desc(tests.updatedAt));

export const insertTest = async (db: Executor, values: NewTestRow): Promise<TestRecord> => {
  const [row] = await db.insert(tests).values(values).returning();
  if (row === undefined) throw new Error('Insert into tests returned no rows');
  return row;
};

export const updateTest = async (
  db: Executor,
  id: string,
  patch: Partial<Omit<NewTestRow, 'id' | 'orgId' | 'createdBy'>>,
  now: Date,
): Promise<TestRecord | null> => {
  const [row] = await db
    .update(tests)
    .set({ ...patch, updatedAt: now })
    .where(eq(tests.id, id))
    .returning();
  return row ?? null;
};
