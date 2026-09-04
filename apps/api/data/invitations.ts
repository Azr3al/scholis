import { invitations, type Executor, type InvitationRow } from '@scholis/db';
import { and, eq, isNull } from 'drizzle-orm';

export type InvitationRecord = InvitationRow;

export const insertInvitation = async (
  db: Executor,
  values: {
    orgId: string;
    email: string;
    token: string;
    invitedBy: string | null;
    expiresAt: Date;
  },
): Promise<InvitationRecord> => {
  const [row] = await db.insert(invitations).values(values).returning();
  if (row === undefined) throw new Error('Insert into invitations returned no rows');
  return row;
};

/** Only ever looked up by token — an unaccepted, unexpired one. */
export const findOpenInvitation = async (
  db: Executor,
  token: string,
): Promise<InvitationRecord | null> => {
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, token), isNull(invitations.acceptedAt)))
    .limit(1);
  return row ?? null;
};

export const listInvitations = async (
  db: Executor,
  orgId: string,
): Promise<InvitationRecord[]> =>
  db.select().from(invitations).where(eq(invitations.orgId, orgId));

export const markInvitationAccepted = async (
  db: Executor,
  id: string,
  now: Date,
): Promise<void> => {
  await db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, id));
};
