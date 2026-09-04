import {
  questionOptions,
  questions,
  shortAnswerKeys,
  type Executor,
  type NewQuestionRow,
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

/**
 * Every question for a test, assembled into the domain shape **with answer keys**.
 *
 * SERVER ONLY by consequence rather than by decoration: the result carries
 * `isCorrect` and `acceptedAnswers`. Callers that ship anything to a device must
 * put it through `testPackageSchema.parse`, which strips both.
 *
 * Three queries rather than a join, because a join across questions × options ×
 * keys multiplies rows and then needs de-duplicating in JavaScript — more code
 * and more ways to be wrong than fetching three flat sets and grouping once.
 */
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
    const base = { id: row.id, body: row.body, points: row.points, position: index };

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

export const insertQuestion = async (
  db: Executor,
  values: NewQuestionRow,
): Promise<QuestionRecord> => {
  const [row] = await db.insert(questions).values(values).returning();
  if (row === undefined) throw new Error('Insert into questions returned no rows');
  return row;
};

export const insertChoiceOptions = async (
  db: Executor,
  questionId: string,
  options: { body: QuestionRecord['body']; isCorrect: boolean }[],
): Promise<void> => {
  if (options.length === 0) return;
  await db.insert(questionOptions).values(
    options.map((o, position) => ({
      questionId,
      body: o.body,
      isCorrect: o.isCorrect,
      position,
    })),
  );
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

export const deleteQuestion = async (db: Executor, questionId: string): Promise<void> => {
  await db.delete(questions).where(eq(questions.id, questionId));
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
