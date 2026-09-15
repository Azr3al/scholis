import type { RichText } from '@scholis/schema';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, users } from './organizations';

export const testStatus = pgEnum('test_status', ['draft', 'published', 'closed']);

export const tests = pgTable(
  'tests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    status: testStatus('status').notNull().default('draft'),

    /** Short and human-readable, e.g. SCHOL-4F2K — a teacher reads it aloud. */
    code: text('code').notNull().unique(),
    version: integer('version').notNull().default(1),

    /** `null` means untimed. */
    timeLimitMinutes: integer('time_limit_minutes'),
    allowNavigation: boolean('allow_navigation').notNull().default(true),
    maxAttempts: integer('max_attempts').notNull().default(1),

    // Turns on the in-browser deterrents: no selecting or copying question
    // text, no context menu. A deterrent and not a boundary — anyone can read
    // the DOM — so it is opt-in per test rather than implied by publishing.
    testTakingMode: boolean('test_taking_mode').notNull().default(false),

    /** When true, each attempt gets a per-student shuffle within section runs. */
    randomizeQuestionOrder: boolean('randomize_question_order').notNull().default(false),

    introBody: jsonb('intro_body').$type<RichText>().notNull(),
    outroBody: jsonb('outro_body').$type<RichText>().notNull(),

    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * Reserved for LTI 1.3. Unused in v1 and deliberately so:
     * the column costs nothing now and means adopting LTI later is not a
     * migration that rewrites history.
     */
    ltiContextId: text('lti_context_id'),

    /**
     * The integrating system's own course identifier, carried so results can
     * be filtered by class without Scholis knowing what a class is.
     *
     * Separate from `lti_context_id` rather than reusing it. They would hold
     * the same kind of value today, but an LTI deployment and a direct API
     * integration are different callers with different id spaces, and one
     * column holding whichever happened to write last is the sort of thing
     * that is only discovered when both are live.
     */
    courseRef: text('course_ref'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('tests_org_status_idx').on(table.orgId, table.status)],
);
