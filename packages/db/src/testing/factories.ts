import {
  emptyRichText,
  type ChoiceSettings,
  type EssaySettings,
  type ShortSettings,
} from '@scholis/schema';
import { randomUUID } from 'node:crypto';
import type { Executor } from '../executor.types';
import * as t from '../schema';

/**
 * Row builders for integration tests.
 *
 * Every factory takes an executor first, mirroring the `data/` convention, so a
 * test can build a fixture inside the same transaction as the code under test.
 */

/** Narrow an `insert ... returning` result without a non-null assertion. */
const one = <T>(rows: T[]): T => {
  const [row] = rows;
  if (row === undefined) throw new Error('Insert returned no rows');
  return row;
};

const unique = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

export const makeOrg = async (db: Executor, overrides: { name?: string; slug?: string } = {}) =>
  one(
    await db
      .insert(t.organizations)
      .values({
        name: overrides.name ?? 'Test School',
        slug: overrides.slug ?? unique('school'),
      })
      .returning(),
  );

export const makeUser = async (
  db: Executor,
  orgId: string,
  overrides: { email?: string; name?: string; role?: 'owner' | 'teacher' } = {},
) =>
  one(
    await db
      .insert(t.users)
      .values({
        orgId,
        email: overrides.email ?? `${unique('teacher')}@example.test`,
        name: overrides.name ?? 'Test Teacher',
        role: overrides.role ?? 'teacher',
      })
      .returning(),
  );

export const makeTest = async (
  db: Executor,
  args: {
    orgId: string;
    createdBy: string;
    title?: string;
    status?: 'draft' | 'published' | 'closed';
    code?: string;
    timeLimitMinutes?: number | null;
    allowNavigation?: boolean;
    maxAttempts?: number;
  },
) =>
  one(
    await db
      .insert(t.tests)
      .values({
        orgId: args.orgId,
        createdBy: args.createdBy,
        title: args.title ?? 'Photosynthesis',
        status: args.status ?? 'draft',
        code: args.code ?? unique('SCHOL').toUpperCase(),
        timeLimitMinutes: args.timeLimitMinutes === undefined ? 30 : args.timeLimitMinutes,
        allowNavigation: args.allowNavigation ?? true,
        maxAttempts: args.maxAttempts ?? 1,
        introBody: emptyRichText(),
        outroBody: emptyRichText(),
      })
      .returning(),
  );

export const makeChoiceQuestion = async (
  db: Executor,
  testId: string,
  args: {
    correctness?: boolean[];
    settings?: Partial<ChoiceSettings>;
    points?: number;
    position?: number;
  } = {},
) => {
  const settings: ChoiceSettings = {
    selection: 'single',
    variant: 'plain',
<<<<<<< HEAD
    partialCredit: false,
=======
    rubric: null,
>>>>>>> master
    ...args.settings,
  };

  const question = one(
    await db
      .insert(t.questions)
      .values({
        testId,
        type: 'choice',
        body: emptyRichText(),
        bodyText: '',
        points: args.points ?? 1,
        position: args.position ?? 0,
        settings,
      })
      .returning(),
  );

  const correctness = args.correctness ?? [true, false];
  const options = await db
    .insert(t.questionOptions)
    .values(
      correctness.map((isCorrect, position) => ({
        questionId: question.id,
        body: emptyRichText(),
        isCorrect,
        position,
      })),
    )
    .returning();

  return { question, options };
};

export const makeShortQuestion = async (
  db: Executor,
  testId: string,
  args: {
    acceptedAnswers?: string[];
    settings?: Partial<ShortSettings>;
    points?: number;
    position?: number;
  } = {},
) => {
  const settings: ShortSettings = { caseSensitive: false, ...args.settings };

  const question = one(
    await db
      .insert(t.questions)
      .values({
        testId,
        type: 'short',
        body: emptyRichText(),
        bodyText: '',
        points: args.points ?? 1,
        position: args.position ?? 0,
        settings,
      })
      .returning(),
  );

  const keys = await db
    .insert(t.shortAnswerKeys)
    .values(
      (args.acceptedAnswers ?? ['Paris']).map((text, position) => ({
        questionId: question.id,
        text,
        position,
      })),
    )
    .returning();

  return { question, keys };
};

export const makeEssayQuestion = async (
  db: Executor,
  testId: string,
  args: { settings?: Partial<EssaySettings>; points?: number; position?: number } = {},
) => {
  const settings: EssaySettings = { minWords: null, maxWords: null, ...args.settings };

  return one(
    await db
      .insert(t.questions)
      .values({
        testId,
        type: 'essay',
        body: emptyRichText(),
        bodyText: '',
        points: args.points ?? 5,
        position: args.position ?? 0,
        settings,
      })
      .returning(),
  );
};

export const makeAttempt = async (
  db: Executor,
  testId: string,
  args: {
    takerName?: string;
    status?: 'created' | 'in_progress' | 'submitted' | 'graded' | 'released';
    startedAt?: Date;
    serverDeadlineAt?: Date;
  } = {},
) =>
  one(
    await db
      .insert(t.attempts)
      .values({
        testId,
        takerName: args.takerName ?? 'Ada Lovelace',
        status: args.status ?? 'created',
        startedAt: args.startedAt ?? null,
        serverDeadlineAt: args.serverDeadlineAt ?? null,
      })
      .returning(),
  );
