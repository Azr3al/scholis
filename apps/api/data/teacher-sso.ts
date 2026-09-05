import { teacherSsoTickets, type Executor, type TeacherSsoTicketRow } from '@scholis/db';
import { and, eq, isNull } from 'drizzle-orm';

export type TeacherSsoTicketRecord = TeacherSsoTicketRow;

export const insertTeacherSsoTicket = async (
  db: Executor,
  values: {
    orgId: string;
    userId: string;
    token: string;
    externalRef: string | null;
    mintedByClientId: string | null;
    expiresAt: Date;
  },
): Promise<TeacherSsoTicketRecord> => {
  const [row] = await db.insert(teacherSsoTickets).values(values).returning();
  if (row === undefined) throw new Error('Insert into teacher_sso_tickets returned no rows');
  return row;
};

/**
 * Redeem a sign-in ticket, once.
 *
 * An UPDATE ... WHERE redeemed_at IS NULL ... RETURNING, not a read followed by
 * a write — the same shape `claimLaunchToken` and `claimMutation` use, for the
 * same reason. Two browsers opening a forwarded link at the same moment both
 * pass a read-then-check; only one can win this. Here the prize is a staff
 * session rather than a place in a paper, so losing the race matters more.
 *
 * Returns null when the ticket does not exist or has already been spent, and
 * the caller reports that identically to an expired one. Telling them apart
 * would reveal whether a token was ever real.
 */
export const claimTeacherSsoTicket = async (
  db: Executor,
  token: string,
  now: Date,
): Promise<TeacherSsoTicketRecord | null> => {
  const [row] = await db
    .update(teacherSsoTickets)
    .set({ redeemedAt: now })
    .where(and(eq(teacherSsoTickets.token, token), isNull(teacherSsoTickets.redeemedAt)))
    .returning();
  return row ?? null;
};
