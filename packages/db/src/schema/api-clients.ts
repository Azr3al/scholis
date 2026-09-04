import type { ApiScope } from '@scholis/schema';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations, users } from './organizations';

export const apiClientKind = pgEnum('api_client_kind', ['platform', 'org']);

/**
 * A machine credential belonging to another system.
 *
 * Tiered on purpose. A `platform` client is the integrating product itself —
 * it provisions organisations and mints their keys, and holds no scope that
 * reads a paper or a mark. An `org` client acts inside one school and can
 * never mint a credential. Revoking a leaked org key therefore contains the
 * whole breach, which is not true if any key can mint another.
 *
 * `org_id` is null for platform clients because they act across organisations;
 * every org client has one, and every scoped query goes through it.
 */
export const apiClients = pgTable(
  'api_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: apiClientKind('kind').notNull(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    /** Shown to humans in the dashboard: "Schedjuice production". */
    name: text('name').notNull(),
    /**
     * Public half of the credential, and the reason a lookup is one indexed
     * read rather than a scan. Without it, verifying a key would mean hashing
     * the candidate against every live row.
     */
    keyId: text('key_id').notNull().unique(),
    scopes: text('scopes').array().$type<ApiScope[]>().notNull(),
    /** Null when minted by another machine rather than by a person. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Written on use, best-effort. Its job is spotting keys nobody uses. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('api_clients_org_idx').on(table.orgId)],
);

/**
 * The secret half, hashed, and separate so a client can hold more than one.
 *
 * Two live secrets is what makes rotation something other than an outage:
 * issue the new one, deploy it on the caller, revoke the old one. A single
 * column would force a flag-day swap, which in practice means the secret never
 * gets rotated at all.
 *
 * SHA-256 rather than argon2 or bcrypt, and that is not an oversight. Slow
 * hashes exist to make brute force expensive against low-entropy human
 * passwords. This is 32 random bytes — there is nothing to guess — and a
 * deliberately slow hash on every single API request would be a self-inflicted
 * latency problem for no security gain.
 */
export const apiClientSecrets = pgTable(
  'api_client_secrets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => apiClients.id, { onDelete: 'cascade' }),
    secretHash: text('secret_hash').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('api_client_secrets_client_idx').on(table.clientId)],
);
