import {
  findOpenInvitation,
  insertInvitation,
  listInvitations,
  markInvitationAccepted,
} from '@/data/invitations';
import { findUserByEmail, insertUser, listUsersForOrg } from '@/data/users';
import type { AuthedContext, PublicContext } from '@/server/context.types';
import { forbidden, notFound, validationFailed } from '@/server/errors';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Team membership: invite, accept, list.
 *
 * A team is the organisation. `users.org_id` already scopes every test, so two
 * people in the same org share a quiz library and can both edit it — no
 * permissions model, no membership table, nothing new for the authoring code
 * to know about. Kept in one file because all three verbs share the same
 * guards and shape.
 */

/** Long enough that guessing is not a strategy. */
const newToken = (): string => randomBytes(32).toString('base64url');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'teacher';
}

export interface PendingInvite {
  id: string;
  email: string;
  expiresAt: string;
}

// --- list ------------------------------------------------------------------

export const getTeam = async (
  ctx: AuthedContext,
): Promise<{ members: TeamMember[]; invites: PendingInvite[] }> => {
  const [users, invitations] = await Promise.all([
    listUsersForOrg(ctx.db, ctx.actor.orgId),
    listInvitations(ctx.db, ctx.actor.orgId),
  ]);

  return {
    members: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })),
    invites: invitations
      .filter((invite) => invite.acceptedAt === null)
      .map((invite) => ({
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
      })),
  };
};

// --- invite ----------------------------------------------------------------

export const inviteMemberInput = z.object({
  // See sign-up.ts: normalised in the service, not the schema.
  email: z.email(),
});

export const inviteMember = async (
  ctx: AuthedContext,
  input: z.infer<typeof inviteMemberInput>,
): Promise<{ email: string; url: string }> => {
  // The one place a role is actually enforced. Anyone in the team may author;
  // only the owner may grow it.
  if (ctx.actor.role !== 'owner') {
    throw forbidden('Only the team owner can invite people.');
  }

  const email = input.email.trim().toLowerCase();

  const existing = await findUserByEmail(ctx.db, email);
  if (existing !== null) {
    throw validationFailed(
      existing.orgId === ctx.actor.orgId
        ? 'That person is already in your team.'
        : 'That email already belongs to another account.',
    );
  }

  const token = newToken();
  await insertInvitation(ctx.db, {
    orgId: ctx.actor.orgId,
    email,
    token,
    invitedBy: ctx.actor.userId,
    expiresAt: new Date(ctx.now().getTime() + INVITE_TTL_MS),
  });

  // Built here rather than in the route so the link in the email and the link
  // returned to the inviter cannot drift apart.
  const webOrigin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
  return { email, url: `${webOrigin}/join?token=${token}` };
};

// --- accept ----------------------------------------------------------------

export const acceptInviteInput = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(1).max(120),
});

/**
 * Public: the invitee has no account yet, so there is nobody to authenticate.
 * The token is the authorisation, the same way a test code is for a student.
 */
export const acceptInvite = async (
  ctx: PublicContext,
  input: z.infer<typeof acceptInviteInput>,
): Promise<{ orgId: string; email: string }> => {
  const invite = await findOpenInvitation(ctx.db, input.token);
  if (invite === null) throw notFound('Invitation');

  if (invite.expiresAt.getTime() < ctx.now().getTime()) {
    throw validationFailed('That invitation has expired. Ask for a new one.');
  }

  // Checked again at accept time, not just at invite time — someone may have
  // signed up on their own in between.
  const existing = await findUserByEmail(ctx.db, invite.email);
  if (existing !== null) {
    throw validationFailed('An account already exists for that email. Sign in instead.');
  }

  return ctx.db.transaction(async (tx) => {
    const user = await insertUser(tx, {
      orgId: invite.orgId,
      email: invite.email,
      name: input.name,
      role: 'teacher',
    });

    // Single use. A leaked link cannot be replayed into a second account.
    await markInvitationAccepted(tx, invite.id, ctx.now());

    return { orgId: user.orgId, email: user.email };
  });
};
