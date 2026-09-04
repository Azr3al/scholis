import { attempts, type AttemptRow, type Executor, type NewAttemptRow } from '@scholis/db';
import type { AttemptStatus } from '@scholis/schema';
import { and, count, desc, eq } from 'drizzle-orm';
import { fromNumber, toNumber } from './mapping';

/**
 * An attempt in application terms.
 *
 * `score` and `maxScore` are `number | null` here, not the `string | null`
 * Drizzle returns for `numeric`. `null` is preserved rather than defaulted to
 * zero: "not marked yet" and "scored zero" are different facts, and collapsing
 * them here would erase the distinction before a service could act on it.
 */
export interface AttemptRecord {
  id: string;
  testId: string;
  takerName: string;
  takerRef: string | null;
  status: AttemptStatus;
  startedAt: Date | null;
  serverDeadlineAt: Date | null;
  submittedAt: Date | null;
  overdueSeconds: number;
  score: number | null;
  maxScore: number | null;
  releasedAt: Date | null;
  releasedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const toRecord = (row: AttemptRow): AttemptRecord => ({
  id: row.id,
  testId: row.testId,
  takerName: row.takerName,
  takerRef: row.takerRef,
  status: row.status,
  startedAt: row.startedAt,
  serverDeadlineAt: row.serverDeadlineAt,
  submittedAt: row.submittedAt,
  overdueSeconds: row.overdueSeconds,
  score: toNumber(row.score),
  maxScore: toNumber(row.maxScore),
  releasedAt: row.releasedAt,
  releasedBy: row.releasedBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const findAttemptById = async (db: Executor, id: string): Promise<AttemptRecord | null> => {
  const [row] = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
  return row === undefined ? null : toRecord(row);
};

export const listAttemptsForTest = async (
  db: Executor,
  testId: string,
): Promise<AttemptRecord[]> => {
  const rows = await db
    .select()
    .from(attempts)
    .where(eq(attempts.testId, testId))
    .orderBy(desc(attempts.createdAt));
  return rows.map(toRecord);
};

export const countAttemptsByTaker = async (
  db: Executor,
  testId: string,
  takerName: string,
): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(attempts)
    .where(and(eq(attempts.testId, testId), eq(attempts.takerName, takerName)));
  return row?.value ?? 0;
};

export const insertAttempt = async (
  db: Executor,
  values: NewAttemptRow,
): Promise<AttemptRecord> => {
  const [row] = await db.insert(attempts).values(values).returning();
  if (row === undefined) throw new Error('Insert into attempts returned no rows');
  return toRecord(row);
};

export interface AttemptPatch {
  status?: AttemptStatus;
  startedAt?: Date | null;
  serverDeadlineAt?: Date | null;
  submittedAt?: Date | null;
  overdueSeconds?: number;
  score?: number | null;
  maxScore?: number | null;
  releasedAt?: Date | null;
  releasedBy?: string | null;
}

export const updateAttempt = async (
  db: Executor,
  id: string,
  patch: AttemptPatch,
  now: Date,
): Promise<AttemptRecord | null> => {
  // Destructured rather than spread-and-override: a conditional spread leaves
  // `number` in the type even when the value is replaced at runtime, so Drizzle
  // still sees an incompatible column type.
  const { score, maxScore, ...rest } = patch;

  const [row] = await db
    .update(attempts)
    .set({
      ...rest,
      ...(score === undefined ? {} : { score: fromNumber(score) }),
      ...(maxScore === undefined ? {} : { maxScore: fromNumber(maxScore) }),
      updatedAt: now,
    })
    .where(eq(attempts.id, id))
    .returning();
  return row === undefined ? null : toRecord(row);
};

/**
 * Release every submitted attempt on a test in one statement.
 *
 * Returns the affected rows so the caller can emit one event per release
 * without a second read.
 */
export const releaseSubmittedAttempts = async (
  db: Executor,
  testId: string,
  releasedBy: string,
  now: Date,
): Promise<AttemptRecord[]> => {
  const rows = await db
    .update(attempts)
    .set({ status: 'released', releasedAt: now, releasedBy, updatedAt: now })
    .where(and(eq(attempts.testId, testId), eq(attempts.status, 'graded')))
    .returning();
  return rows.map(toRecord);
};
