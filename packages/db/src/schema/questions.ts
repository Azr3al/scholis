import type { ChoiceSettings, EssaySettings, RichText, ShortSettings } from '@scholis/schema';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tests } from './tests';

<<<<<<< HEAD
/**
 * Three storage types. The teacher sees five (DESIGN.md §4).
 *
 * True/false, Yes/No and rating scales are authoring templates over `choice`,
 * recorded in `settings.variant`. Adding a template is UI work and no migration.
 */
export const questionType = pgEnum('question_type', ['choice', 'short', 'essay']);

=======
// Three storage types, five in the UI. Variants live in `settings`, so adding a
// template is UI work and no migration.
export const questionType = pgEnum('question_type', ['choice', 'short', 'essay']);

/**
 * Headings over the question list, not a second ordering.
 *
 * A question keeps its own `position` within the test, and that stays the
 * single source of order — a section is a label that a run of questions
 * carries. That is what keeps the attempt engine untouched: the cursor still
 * walks one flat list, and "question 3 of 10" still means what it did.
 *
 * A test with no sections behaves exactly as before, because `section_id` is
 * nullable and every existing row has it null.
 */
export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    description: jsonb('description').$type<RichText>(),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('sections_test_position_idx').on(table.testId, table.position)],
);

>>>>>>> master
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    type: questionType('type').notNull(),

    body: jsonb('body').$type<RichText>().notNull(),
    /** Flattened `body`, for search and for anchoring teacher comments. */
    bodyText: text('body_text').notNull().default(''),

    points: integer('points').notNull().default(1),
    position: integer('position').notNull().default(0),

<<<<<<< HEAD
=======
    // Nullable, and set null rather than cascade when a section goes: deleting
    // a heading must not delete the questions under it.
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),

>>>>>>> master
    settings: jsonb('settings').$type<ChoiceSettings | ShortSettings | EssaySettings>().notNull(),
  },
  (table) => [index('questions_test_position_idx').on(table.testId, table.position)],
);

<<<<<<< HEAD
/**
 * ANSWER KEY. `is_correct` never leaves the server.
 *
 * `testPackageSchema.parse` strips it by construction (see
 * `packages/schema/src/question.ts`), and `no-scoring-in-client` stops client
 * code reaching the scorer that reads it.
 */
=======
// ANSWER KEY. is_correct never leaves the server — testPackageSchema.parse
// strips it, and no-scoring-in-client stops client code reaching the scorer.
>>>>>>> master
export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    body: jsonb('body').$type<RichText>().notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('question_options_question_position_idx').on(table.questionId, table.position)],
);

/** ANSWER KEY. Plain text; comparison rules live in `scoring`, not here. */
export const shortAnswerKeys = pgTable(
  'short_answer_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    uniqueIndex('short_answer_keys_question_position_key').on(table.questionId, table.position),
  ],
);
