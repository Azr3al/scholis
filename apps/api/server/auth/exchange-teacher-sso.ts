import { claimTeacherSsoTicket } from '@/data/teacher-sso';
import type { PublicContext } from '@/server/context.types';
import { forbidden } from '@/server/errors';
import { z } from 'zod';

/**
 * Turn a one-time sign-in ticket into an authenticated identity.
 *
 * Unauthenticated by definition — proving who you are is the whole point of
 * calling it — so this takes a `PublicContext` and returns an identity rather
 * than trusting one.
 *
 * It stops at "this is user X in school Y". Creating the Better Auth session
 * and setting its cookie is `lib/auth-plugins/teacher-sso.ts`, because cookie
 * attributes belong to the thing that owns the session: hand-rolling them here
 * would give Scholis a second, drifting definition of sameSite and secure.
 *
 * Lives under `server/auth/` beside `resolve-actor.ts` rather than under
 * `server/integrations/`, because the caller here is a teacher's browser and not
 * the integrating system. The integrator's half is the mint, over in
 * `server/integrations/teacher-sso.ts`.
 */
export const exchangeTeacherSsoInput = z.object({
  ticket: z.string().trim().min(1).max(200),
});

export type ExchangeTeacherSsoInput = z.infer<typeof exchangeTeacherSsoInput>;

export interface ExchangedTeacherSso {
  userId: string;
  orgId: string;
}

export const exchangeTeacherSsoTicket = async (
  ctx: PublicContext,
  input: ExchangeTeacherSsoInput,
): Promise<ExchangedTeacherSso> => {
  const now = ctx.now();

  // Claimed before anything is decided, so a ticket cannot be spent twice by
  // two requests racing. Expiry is then read off the claimed row.
  const ticket = await claimTeacherSsoTicket(ctx.db, input.ticket, now);

  // One refusal for missing, spent and expired alike. Telling them apart would
  // reveal whether a token was ever real, which is free reconnaissance against
  // the mint endpoint.
  if (ticket === null || ticket.expiresAt.getTime() <= now.getTime()) {
    throw forbidden('That sign-in link has already been used or has expired.');
  }

  return { userId: ticket.userId, orgId: ticket.orgId };
};
