import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apiClients } from './api-clients';
import { organizations, users } from './organizations';

/**
 * A one-time ticket that opens a staff session for one existing teacher.
 *
 * The teacher-side counterpart to `launch_tokens`. Same shape, same reasoning,
 * opposite subject: a launch ticket admits a student to a paper, this one signs
 * a teacher in.
 *
 * Stateful rather than a signed token like `server/attempt-token.ts`, and for
 * the same reason the launch ticket is. An attempt token has to survive a
 * device being offline for hours with nothing to look up; this is redeemed
 * seconds after it is minted, so a row costs nothing and single-use is worth
 * having. A replayed SSO link is a hijacked staff session, which is a strictly
 * worse outcome than a replayed answer sync.
 *
 * It cannot create an account. `user_id` is resolved when the ticket is minted
 * and is not null, so a ticket always names an account that already existed at
 * that moment — sign-in authenticates, it never provisions.
 */
export const teacherSsoTickets = pgTable(
  'teacher_sso_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /**
     * Resolved at mint time rather than carrying an email to be looked up at
     * redemption.
     *
     * Emails are globally unique here, so a lookup at redemption would be
     * unambiguous today — but resolving early means the ticket names an
     * account, not a string that could later be reassigned to a different
     * person. A live ticket follows the teacher it was minted for and nobody
     * else, whatever happens to the address in between.
     */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Random and unguessable; holding it is the entire authorisation. */
    token: text('token').notNull().unique(),
    /**
     * The calling system's own staff identifier, for audit only.
     *
     * Never used to authorise anything — authorisation is `user_id`. It exists
     * so that when a school reports "our coordinator got somebody else's
     * papers", there is something to correlate the two sides of the integration
     * against. Null when the caller did not supply one.
     */
    externalRef: text('external_ref'),
    /** Which credential minted this. Null when a person did, which is unusual. */
    mintedByClientId: uuid('minted_by_client_id').references(() => apiClients.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set by the claim, which is what makes redemption single-use. */
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('teacher_sso_tickets_org_idx').on(table.orgId)],
);
