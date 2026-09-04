import { users, type Executor, type UserRow } from '@scholis/db';
import { eq } from 'drizzle-orm';

export type UserRecord = UserRow;

export const findUserById = async (db: Executor, id: string): Promise<UserRecord | null> => {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
};

export const findUserByEmail = async (db: Executor, email: string): Promise<UserRecord | null> => {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
};

export const insertUser = async (
  db: Executor,
  values: {
    orgId: string;
    email: string;
    name: string;
    role: 'owner' | 'teacher';
  },
): Promise<UserRecord> => {
  const [row] = await db
    .insert(users)
    // Provisioned by signup or by accepting an invitation, both of which prove
    // control of the address before the row exists — so the first magic link
    // isn't blocked by a verification that has already happened.
    .values({ ...values, emailVerified: true })
    .returning();
  if (row === undefined) throw new Error('Insert into users returned no rows');
  return row;
};

export const listUsersForOrg = async (db: Executor, orgId: string): Promise<UserRecord[]> =>
  db.select().from(users).where(eq(users.orgId, orgId));
