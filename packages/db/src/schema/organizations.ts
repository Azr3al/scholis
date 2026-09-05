import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Created by the provisioning script, by teacher sign-up, or by a platform
// credential on behalf of an integrating system. Never by an ordinary request.
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /**
   * The integrating system's own identifier for this school — for a
   * multi-tenant caller, its tenant key.
   *
   * Unique, which is what makes provisioning idempotent: a caller that retries
   * after a timeout gets back the organisation it already created rather than
   * a second one holding half a school. Null for organisations nobody else
   * knows about.
   */
  externalRef: text('external_ref').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userRole = pgEnum('user_role', ['owner', 'teacher']);

// Teachers and admins only. Students are never rows here.
//
// email is globally unique, so one person can't yet belong to two schools.
// Fine for admin-provisioned v1; modelling memberships now would be an
// abstraction with one implementation.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: userRole('role').notNull().default('teacher'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    // Required by Better Auth's `user` model, which is mapped onto this table
    // rather than a parallel one (see `auth.ts`). Authentication is Better
    // Auth's concern; identity and tenancy remain ours.
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email)],
);
