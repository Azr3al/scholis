import { attempts, tests, type AttemptRow, type Executor, type NewAttemptRow } from '@scholis/db';
import type { AttemptStatus } from '@scholis/schema';
import { and, count, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { fromNumber, toNumber } from './mapping';

// score/maxScore come back as number, not Drizzle's string. null is preserved
// rather than defaulted to zero — "not marked yet" and "scored zero" are
// different facts.
export interface AttemptRecord {
  id: string;
  testId: string;
  takerName: string;
  takerRef: string | null;
  status: AttemptStatus;
  questionOrder: string[] | null;
  startedAt: Date | null;
  serverDeadlineAt: Date | null;
  submittedAt: Date | null;
  overdueSeconds: number;
  score: number | null;
  maxScore: number | null;
  releasedAt: Date | null;
  releasedBy: string | null;
  studentComment: string | null;
  studentCommentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toRecord = (row: AttemptRow): AttemptRecord => ({
  id: row.id,
  testId: row.testId,
  takerName: row.takerName,
  takerRef: row.takerRef,
  status: row.status,
  questionOrder: row.questionOrder ?? null,
  startedAt: row.startedAt,
  serverDeadlineAt: row.serverDeadlineAt,
  submittedAt: row.submittedAt,
  overdueSeconds: row.overdueSeconds,
  score: toNumber(row.score),
  maxScore: toNumber(row.maxScore),
  releasedAt: row.releasedAt,
  releasedBy: row.releasedBy,
  studentComment: row.studentComment ?? null,
  studentCommentAt: row.studentCommentAt ?? null,
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
    .orderBy(desc(attempts.submittedAt), desc(attempts.createdAt));
  return rows.map(toRecord);
};

export const listCommentsForTest = async (
  db: Executor,
  testId: string,
): Promise<AttemptRecord[]> => {
  const rows = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.testId, testId), isNotNull(attempts.studentComment)))
    .orderBy(desc(attempts.studentCommentAt));
  return rows.map(toRecord);
};

export const setStudentComment = async (
  db: Executor,
  id: string,
  comment: string,
  now: Date,
): Promise<AttemptRecord | null> => {
  const [row] = await db
    .update(attempts)
    .set({ studentComment: comment, studentCommentAt: now, updatedAt: now })
    .where(eq(attempts.id, id))
    .returning();
  return row === undefined ? null : toRecord(row);
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
  questionOrder?: string[] | null;
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

export interface ReleasedAttemptRow {
  attempt: AttemptRecord;
  testId: string;
  testTitle: string;
  courseRef: string | null;
}

/**
 * Released attempts across a whole organisation, for a gradebook to pull.
 *
 * `status = 'released'` lives in the WHERE rather than being left to the
 * caller, so an unreleased mark cannot leave here by accident. That matters
 * more than it looks: report cards get emailed to parents, and a score
 * reaching one before the teacher has finished marking is not the kind of bug
 * anybody gets to explain away afterwards.
 */
export const listReleasedAttemptsForOrg = async (
  db: Executor,
  filter: { orgId: string; courseRef?: string; from?: Date; to?: Date },
): Promise<ReleasedAttemptRow[]> => {
  const conditions = [eq(tests.orgId, filter.orgId), eq(attempts.status, 'released')];
  if (filter.courseRef !== undefined) conditions.push(eq(tests.courseRef, filter.courseRef));
  if (filter.from !== undefined) conditions.push(gte(attempts.releasedAt, filter.from));
  if (filter.to !== undefined) conditions.push(lte(attempts.releasedAt, filter.to));

  const rows = await db
    .select({ attempt: attempts, title: tests.title, courseRef: tests.courseRef })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(and(...conditions))
    .orderBy(desc(attempts.releasedAt));

  return rows.map((row) => ({
    attempt: toRecord(row.attempt),
    testId: row.attempt.testId,
    testTitle: row.title,
    courseRef: row.courseRef,
  }));
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
