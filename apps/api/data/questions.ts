import {
  questionOptions,
  questions,
  shortAnswerKeys,
  type Executor,
  type NewQuestionRow,
  type QuestionOptionRow,
  type QuestionRow,
} from '@scholis/db';
import {
  keyedQuestionSchema,
  type ChoiceSettings,
  type EssaySettings,
  type KeyedQuestion,
  type ShortSettings,
} from '@scholis/schema';
import { asc, eq, inArray } from 'drizzle-orm';

export type QuestionRecord = QuestionRow;

// Returns questions *with* answer keys — server only by consequence, not
// decoration. Anything shipping to a device must go through
// testPackageSchema.parse, which strips them.
//
// Three queries instead of a join: a join multiplies rows and then needs
// de-duplicating in JS, which is more code and more ways to be wrong.
export const listKeyedQuestions = async (
  db: Executor,
  testId: string,
): Promise<KeyedQuestion[]> => {
  const questionRows = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position), asc(questions.id));

  if (questionRows.length === 0) return [];

  const ids = questionRows.map((q) => q.id);

  const [optionRows, keyRows] = await Promise.all([
    db
      .select()
      .from(questionOptions)
      .where(inArray(questionOptions.questionId, ids))
      .orderBy(asc(questionOptions.position), asc(questionOptions.id)),
    db
      .select()
      .from(shortAnswerKeys)
      .where(inArray(shortAnswerKeys.questionId, ids))
      .orderBy(asc(shortAnswerKeys.position), asc(shortAnswerKeys.id)),
  ]);

  const optionsByQuestion = groupBy(optionRows, (row) => row.questionId);
  const keysByQuestion = groupBy(keyRows, (row) => row.questionId);

  return questionRows.map((row, index) => {
    const base = {
      id: row.id,
      body: row.body,
      points: row.points,
      position: index,
      sectionId: row.sectionId,
    };

    switch (row.type) {
      case 'choice':
        return keyedQuestionSchema.parse({
          ...base,
          type: 'choice',
          settings: row.settings as ChoiceSettings,
          options: (optionsByQuestion.get(row.id) ?? []).map((o) => ({
            id: o.id,
            body: o.body,
            isCorrect: o.isCorrect,
          })),
        });

      case 'short':
        return keyedQuestionSchema.parse({
          ...base,
          type: 'short',
          settings: row.settings as ShortSettings,
          acceptedAnswers: (keysByQuestion.get(row.id) ?? []).map((k) => k.text),
        });

      case 'essay':
        return keyedQuestionSchema.parse({
          ...base,
          type: 'essay',
          settings: row.settings as EssaySettings,
        });

      default:
        return assertNever(row.type);
    }
  });
};

/**
 * Compile-time exhaustiveness. Adding a question type to the enum without
 * handling it here becomes a type error rather than a row that silently
 * vanishes from the test.
 */
const assertNever = (value: never): never => {
  throw new Error(`Unhandled question type: ${JSON.stringify(value)}`);
};

export const findQuestionById = async (
  db: Executor,
  id: string,
): Promise<QuestionRecord | null> => {
  const [row] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  return row ?? null;
};

export const insertQuestion = async (
  db: Executor,
  values: NewQuestionRow,
): Promise<QuestionRecord> => {
  const [row] = await db.insert(questions).values(values).returning();
  if (row === undefined) throw new Error('Insert into questions returned no rows');
  return row;
};

// Returns the rows so a caller can quote real option ids without a second read.
export const insertChoiceOptions = async (
  db: Executor,
  questionId: string,
  options: { body: QuestionRecord['body']; isCorrect: boolean }[],
): Promise<QuestionOptionRow[]> => {
  if (options.length === 0) return [];
  return db
    .insert(questionOptions)
    .values(
      options.map((o, position) => ({
        questionId,
        body: o.body,
        isCorrect: o.isCorrect,
        position,
      })),
    )
    .returning();
};

export const insertShortAnswerKeys = async (
  db: Executor,
  questionId: string,
  answers: string[],
): Promise<void> => {
  if (answers.length === 0) return;
  await db
    .insert(shortAnswerKeys)
    .values(answers.map((text, position) => ({ questionId, text, position })));
};

// Type is deliberately not updatable: switching a choice question to an essay
// mid-edit would leave orphaned options and a settings blob for the wrong shape.
// Delete and re-add is the honest way to change a question's type.
export const updateQuestionRow = async (
  db: Executor,
  questionId: string,
  values: Pick<NewQuestionRow, 'body' | 'bodyText' | 'points' | 'settings'>,
): Promise<QuestionRecord> => {
  const [row] = await db
    .update(questions)
    .set(values)
    .where(eq(questions.id, questionId))
    .returning();
  if (row === undefined) throw new Error('Update of questions returned no rows');
  return row;
};

// Options and keys are replaced wholesale rather than diffed. Editing only
// happens on a draft, so nothing references these ids yet, and a diff would be
// considerably more code for no behavioural difference.
export const deleteChoiceOptions = async (db: Executor, questionId: string): Promise<void> => {
  await db.delete(questionOptions).where(eq(questionOptions.questionId, questionId));
};

export const deleteShortAnswerKeys = async (db: Executor, questionId: string): Promise<void> => {
  await db.delete(shortAnswerKeys).where(eq(shortAnswerKeys.questionId, questionId));
};

// Options, answer keys and responses all cascade from the question row.
export const deleteQuestion = async (db: Executor, questionId: string): Promise<void> => {
  await db.delete(questions).where(eq(questions.id, questionId));
};

/** Ids in display order — enough to renumber after a delete, without the bodies. */
export const listQuestionIdsInOrder = async (db: Executor, testId: string): Promise<string[]> => {
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position), asc(questions.id));
  return rows.map((r) => r.id);
};

/** Positions are rewritten wholesale; the caller supplies the final order. */
export const setQuestionPositions = async (
  db: Executor,
  ordered: { id: string; position: number }[],
): Promise<void> => {
  for (const { id, position } of ordered) {
    await db.update(questions).set({ position }).where(eq(questions.id, id));
  }
};

export const countQuestions = async (db: Executor, testId: string): Promise<number> => {
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.testId, testId));
  return rows.length;
};

const groupBy = <T, K>(items: T[], key: (item: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const existing = map.get(k);
    if (existing === undefined) map.set(k, [item]);
    else existing.push(item);
  }
  return map;
};
