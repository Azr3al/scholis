import type { ResponseValue, RichText } from '@scholis/schema';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './organizations';
import { questions } from './questions';
import { tests } from './tests';

export const attemptStatus = pgEnum('attempt_status', [
  'created',
  'in_progress',
  'submitted',
  'graded',
  'released',
]);

<<<<<<< HEAD
/**
 * One taker's run at one test.
 *
 * `status` is an explicit column rather than a derivation from nullable
 * timestamps, because the teacher's results view needs "started but abandoned"
 * and "submitted but not yet graded" on day one (DESIGN.md §4).
 */
=======
// `status` is a real column, not derived from nullable timestamps — the
// results view needs "started but abandoned" and "submitted, not marked".
>>>>>>> master
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),

    takerName: text('taker_name').notNull(),
    /** Optional roster identifier — student number, class list id. */
    takerRef: text('taker_ref'),

    status: attemptStatus('status').notNull().default('created'),

<<<<<<< HEAD
    startedAt: timestamp('started_at', { withTimezone: true }),
    /**
     * Computed and stored when the attempt starts. The authority on time —
     * the client counts down from an offset, but this decides.
     */
=======
    /** Student-facing question sequence when randomization is on. Null = canonical order. */
    questionOrder: jsonb('question_order').$type<string[] | null>(),

    startedAt: timestamp('started_at', { withTimezone: true }),
    // Stored once at start. Everything reads this rather than recomputing from a
    // duration, so clock drift can't lengthen a sitting mid-flight.
>>>>>>> master
    serverDeadlineAt: timestamp('server_deadline_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    overdueSeconds: integer('overdue_seconds').notNull().default(0),

    // numeric(12,4) matches `round4` in the scorer, so a total recomputed from
    // stored per-question scores cannot drift from the original.
    score: numeric('score', { precision: 12, scale: 4 }),
    maxScore: numeric('max_score', { precision: 12, scale: 4 }),

    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedBy: uuid('released_by').references(() => users.id, { onDelete: 'set null' }),

    clientIp: text('client_ip'),
    userAgent: text('user_agent'),

<<<<<<< HEAD
=======
    /** Optional free-text feedback from the student after hand-in. */
    studentComment: text('student_comment'),
    studentCommentAt: timestamp('student_comment_at', { withTimezone: true }),

>>>>>>> master
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('attempts_test_status_idx').on(table.testId, table.status)],
);

export const responses = pgTable(
  'responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),

<<<<<<< HEAD
    /** One column for all three response shapes (DESIGN.md §4). */
    value: jsonb('value').$type<ResponseValue>().notNull(),

    /**
     * Highest client sequence applied to this row. The sync endpoint only
     * overwrites when an incoming mutation carries a higher value, which is
     * what makes out-of-order delivery harmless.
     */
    clientSeq: integer('client_seq').notNull().default(0),

=======
    /** One column for all three response shapes. */
    value: jsonb('value').$type<ResponseValue>().notNull(),

    // Highest clientSeq applied. Sync only overwrites when the incoming one is
    // higher.
    clientSeq: integer('client_seq').notNull().default(0),

    // Accumulated milliseconds the taker had this question on screen. Summed
    // from deltas the client sends through the outbox, so it survives being
    // offline and never double-counts a resend.
    timeSpentMs: integer('time_spent_ms').notNull().default(0),

>>>>>>> master
    markedReview: boolean('marked_review').notNull().default(false),

    score: numeric('score', { precision: 12, scale: 4 }),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    gradedBy: uuid('graded_by').references(() => users.id, { onDelete: 'set null' }),
    feedback: jsonb('feedback').$type<RichText>(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('responses_attempt_question_key').on(table.attemptId, table.questionId)],
);

<<<<<<< HEAD
/**
 * Idempotency ledger for the sync protocol (DESIGN.md §6, rule 3).
 *
 * `id` is client-generated and is NOT defaulted here — that is the whole point.
 * The server inserts `ON CONFLICT DO NOTHING`, so redelivering a mutation is
 * free and duplicate delivery cannot double-apply.
 */
=======
// Idempotency ledger for sync.
//
// `id` is client-generated and deliberately not defaulted — that's the whole
// mechanism. Server inserts ON CONFLICT DO NOTHING, so redelivery is free.
>>>>>>> master
export const mutations = pgTable('mutations', {
  id: uuid('id').primaryKey(),
  attemptId: uuid('attempt_id')
    .notNull()
    .references(() => attempts.id, { onDelete: 'cascade' }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
<<<<<<< HEAD
=======

/**
 * What the browser could observe about the taker leaving the test.
 *
 * Deliberately modest. A browser can tell us the document became hidden or the
 * window lost focus; it cannot tell us whether someone opened a book, used a
 * second device, or alt-tabbed on an OS that does not report it. Storing raw
 * observations rather than a verdict keeps that honest — a teacher sees "left
 * the tab twice for 40 seconds", not "cheated".
 *
 * Rows arrive through the same idempotent outbox as answers, so an event
 * recorded while offline is not lost and a resend cannot duplicate it.
 */
export const attemptEventKind = pgEnum('attempt_event_kind', ['hidden', 'visible', 'blur', 'focus']);

export const attemptEvents = pgTable(
  'attempt_events',
  {
    id: uuid('id').primaryKey(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'cascade' }),
    kind: attemptEventKind('kind').notNull(),
    /** The client's clock. Useful for ordering, not to be trusted as truth. */
    at: timestamp('at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('attempt_events_attempt_idx').on(table.attemptId, table.at)],
);
>>>>>>> master
