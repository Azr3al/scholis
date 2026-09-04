import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './organizations';

// Better Auth's session/verification tables.
//
// It owns authentication — proving someone controls an email. It does not own
// identity: `users` and `organizations` predate it and its user model is
// mapped onto `users` so there's one row per person.
//
// Not using its organization plugin. Orgs are admin-provisioned, so the
// invitation and signup flows are dead weight.
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('sessions_token_key').on(table.token)],
);

// Empty while magic link is the only method — a link proves control without a
// stored credential. Here now so adding Google is config, not a migration.
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Short-lived magic-link tokens. Rows are consumed on use. */
export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Better Auth also expects `emailVerified`, `image` and `updatedAt` on its
 * `user` model. Those live on `users` in `organizations.ts` rather than here:
 * declaring them in this file would mean `organizations.ts` importing from
 * `auth.ts` while `auth.ts` imports `users` back, which is a cycle the
 * `no-cycles` guard would reject — correctly, since module init order would
 * then decide whether the table exists.
 */
