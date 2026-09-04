import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations, users } from './organizations';

/**
 * An invitation to join a team.
 *
 * A team *is* an organisation — `users.org_id` already scopes every test, so
 * two members of the same org share a quiz library and can both edit it
 * without any new permission model. Accepting an invitation therefore just
 * creates a user in that org.
 *
 * The token is the whole authorisation: whoever holds the link may join, in
 * the same way whoever holds a test code may sit the paper. It is single-use
 * and expires.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    /** Random, unguessable, and the only thing the accept route trusts. */
    token: text('token').notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invitations_org_idx').on(table.orgId)],
);
