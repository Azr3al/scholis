import { responses, type Executor, type ResponseRow } from '@scholis/db';
import type { ResponseValue, RichText } from '@scholis/schema';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { fromNumber, toNumber } from './mapping';

export interface ResponseRecord {
  id: string;
  attemptId: string;
  questionId: string;
  value: ResponseValue;
  clientSeq: number;
  markedReview: boolean;
  score: number | null;
  gradedAt: Date | null;
  gradedBy: string | null;
  feedback: RichText | null;
  timeSpentMs: number;
}

const toRecord = (row: ResponseRow): ResponseRecord => ({
  id: row.id,
  attemptId: row.attemptId,
  questionId: row.questionId,
  value: row.value,
  clientSeq: row.clientSeq,
  markedReview: row.markedReview,
  score: toNumber(row.score),
  gradedAt: row.gradedAt,
  gradedBy: row.gradedBy,
  feedback: row.feedback,
  timeSpentMs: row.timeSpentMs,
});

export const listResponsesForAttempt = async (
  db: Executor,
  attemptId: string,
): Promise<ResponseRecord[]> => {
  const rows = await db
    .select()
    .from(responses)
    .where(eq(responses.attemptId, attemptId))
    .orderBy(asc(responses.questionId));
  return rows.map(toRecord);
};

/**
 * The same read, batched.
 *
 * A gradebook pull is a whole class at once, and one query per student would
 * be thirty round trips to fill one column of a report card.
 */
export const listResponsesForAttempts = async (
  db: Executor,
  attemptIds: string[],
): Promise<ResponseRecord[]> => {
  if (attemptIds.length === 0) return [];
  const rows = await db
    .select()
    .from(responses)
    .where(inArray(responses.attemptId, attemptIds))
    .orderBy(asc(responses.questionId));
  return rows.map(toRecord);
};

// Last-write-wins by clientSeq. The WHERE on the conflict branch is what makes
// out-of-order delivery harmless — a late mutation with a lower seq updates
// nothing instead of resurrecting a stale answer.
//
// Returns whether a row was written so the caller can tell "applied" from
// "correctly ignored".
export const upsertAnswer = async (
  db: Executor,
  args: {
    attemptId: string;
    questionId: string;
    value: ResponseValue;
    clientSeq: number;
    now: Date;
  },
): Promise<boolean> => {
  const rows = await db
    .insert(responses)
    .values({
      attemptId: args.attemptId,
      questionId: args.questionId,
      value: args.value,
      clientSeq: args.clientSeq,
      updatedAt: args.now,
    })
    .onConflictDoUpdate({
      target: [responses.attemptId, responses.questionId],
      set: {
        value: sql`excluded.value`,
        clientSeq: sql`excluded.client_seq`,
        updatedAt: args.now,
      },
      where: lt(responses.clientSeq, sql`excluded.client_seq`),
    })
    .returning({ id: responses.id });

  return rows.length > 0;
};

// A mark can arrive before any answer — students flag questions they haven't
// attempted — so this inserts the row rather than requiring one.
export const upsertMark = async (
  db: Executor,
  args: {
    attemptId: string;
    questionId: string;
    marked: boolean;
    clientSeq: number;
    emptyValue: ResponseValue;
    now: Date;
  },
): Promise<boolean> => {
  const rows = await db
    .insert(responses)
    .values({
      attemptId: args.attemptId,
      questionId: args.questionId,
      value: args.emptyValue,
      markedReview: args.marked,
      clientSeq: args.clientSeq,
      updatedAt: args.now,
    })
    .onConflictDoUpdate({
      target: [responses.attemptId, responses.questionId],
      set: {
        markedReview: sql`excluded.marked_review`,
        clientSeq: sql`excluded.client_seq`,
        updatedAt: args.now,
      },
      where: lt(responses.clientSeq, sql`excluded.client_seq`),
    })
    .returning({ id: responses.id });

  return rows.length > 0;
};

/** Write auto-marked scores in one round trip. */
export const setResponseScores = async (
  db: Executor,
  attemptId: string,
  scores: { questionId: string; score: number }[],
  now: Date,
): Promise<void> => {
  for (const { questionId, score } of scores) {
    await db
      .update(responses)
      .set({ score: fromNumber(score), updatedAt: now })
      .where(and(eq(responses.attemptId, attemptId), eq(responses.questionId, questionId)));
  }
};

// Upsert, not update. Students can submit without answering an essay at all,
// and that essay still needs marking or the attempt never reaches `graded` and
// can never be released.
//
// `value` is deliberately not in the conflict branch — marking must never
// overwrite what the student wrote.
export const setManualScore = async (
  db: Executor,
  args: {
    attemptId: string;
    questionId: string;
    score: number;
    feedback: RichText | null;
    gradedBy: string;
    /** Used only when the taker left this question entirely blank. */
    emptyValue: ResponseValue;
    now: Date;
  },
): Promise<ResponseRecord | null> => {
  const [row] = await db
    .insert(responses)
    .values({
      attemptId: args.attemptId,
      questionId: args.questionId,
      value: args.emptyValue,
      score: fromNumber(args.score),
      feedback: args.feedback,
      gradedAt: args.now,
      gradedBy: args.gradedBy,
      updatedAt: args.now,
    })
    .onConflictDoUpdate({
      target: [responses.attemptId, responses.questionId],
      set: {
        score: fromNumber(args.score),
        feedback: args.feedback,
        gradedAt: args.now,
        gradedBy: args.gradedBy,
        updatedAt: args.now,
      },
    })
    .returning();
  return row === undefined ? null : toRecord(row);
};
