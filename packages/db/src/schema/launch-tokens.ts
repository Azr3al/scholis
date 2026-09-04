import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { tests } from './tests';

/**
 * A one-time ticket admitting one named student to one paper.
 *
 * Stateful, unlike the attempt token next to it, and for the opposite reason.
 * An attempt token is stateless because a student may be offline for hours
 * with nothing to look up. A launch ticket is redeemed seconds after it is
 * minted, so the cost of a row is nothing and single-use is worth having: the
 * identity is carried *in* the ticket, so a replayed link would let one
 * student sit a paper under another student's record.
 *
 * `taker_ref` is the calling system's own student id. It is the whole point —
 * it is what makes a mark routable back to a gradebook row rather than
 * guessable from a typed name.
 */
export const launchTokens = pgTable(
  'launch_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    /** Random and unguessable; holding it is the entire authorisation. */
    token: text('token').notNull().unique(),
    takerRef: text('taker_ref').notNull(),
    takerName: text('taker_name').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set by the claim, which is what makes redemption single-use. */
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('launch_tokens_test_idx').on(table.testId)],
);
