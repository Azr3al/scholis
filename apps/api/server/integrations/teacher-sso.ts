import { insertTeacherSsoTicket } from '@/data/teacher-sso';
import { findUserByEmail } from '@/data/users';
import type { AuthedContext } from '@/server/context.types';
import { forbidden, notFound } from '@/server/errors';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Mint a one-time link that signs an existing teacher in.
 *
 * The staff-side counterpart to `launchAttempt`. An integrating system already
 * knows who this teacher is — they are logged into it — so making them prove it
 * again with a magic link is a second inbox to check for no security gained.
 * The caller presents its org credential, Scholis hands back a link, the
 * teacher's browser follows it and arrives with a session.
 *
 * What this deliberately does not do is create anybody. Sign-in authenticates,
 * it never provisions; `lib/auth.ts` enforces that on the database write itself
 * rather than trusting a plugin option. A teacher with no account here is
 * refused and has to be invited through the normal path.
 */

/**
 * Long enough to survive a redirect and a slow page load, short enough that a
 * link leaked into a browser history or a proxy log is stale before it is
 * useful. Shorter than a launch ticket (15 minutes), because that one has to
 * survive a class of thirty devices arriving over several minutes and this one
 * is followed immediately by the person it was minted for.
 */
const TICKET_TTL_MS = 5 * 60 * 1000;

export const teacherSsoInput = z.object({
  // Normalised in the service, matching sign-up and team: the schema says what
  // shape is acceptable, the service decides what identity means.
  email: z.email(),
  /**
   * The caller's own staff identifier. Recorded for audit and never used to
   * authorise anything — authorisation is the resolved Scholis user.
   */
  externalRef: z.string().trim().max(120).optional(),
});

export type TeacherSsoInput = z.infer<typeof teacherSsoInput>;

export interface TeacherSsoTicket {
  url: string;
  expiresAt: string;
}

export const mintTeacherSsoTicket = async (
  ctx: AuthedContext,
  input: TeacherSsoInput,
): Promise<TeacherSsoTicket> => {
  if (!ctx.actor.scopes.includes('sso:write')) {
    throw forbidden('This key cannot sign teachers in.');
  }

  const email = input.email.trim().toLowerCase();
  const user = await findUserByEmail(ctx.db, email);

  // One refusal for "no such teacher" and "a teacher at another school" alike.
  // Email is globally unique here, so without this an org credential could
  // enumerate which addresses hold accounts at other schools by watching
  // whether the message changed.
  //
  // The optional chain is the whole rule, not a shorthand for a null check: a
  // missing user yields `undefined`, which matches no org id, so both cases
  // fall into the same branch by construction rather than by remembering to
  // write two conditions.
  if (user?.orgId !== ctx.actor.orgId) throw notFound('Teacher');

  const now = ctx.now();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + TICKET_TTL_MS);

  await insertTeacherSsoTicket(ctx.db, {
    orgId: ctx.actor.orgId,
    // Resolved here, so the ticket names an account rather than an address that
    // could later belong to somebody else.
    userId: user.id,
    token,
    externalRef: input.externalRef ?? null,
    // For a machine actor `userId` carries the client id — see
    // resolve-client-actor.ts. A person minting one of these is possible but
    // unusual, and leaves the column null.
    //
    // `kind === 'client'` is doing real work here, not just tidying the audit
    // trail: `minted_by_client_id` is a uuid foreign key onto api_clients, and
    // a client actor's userId is the only kind guaranteed to be one. The same
    // field on a person is a users.id, which would satisfy the type and then
    // fail the constraint — attributing the ticket to a credential that never
    // existed.
    mintedByClientId: ctx.actor.kind === 'client' ? ctx.actor.userId : null,
    expiresAt,
  });

  // Built here rather than in the route, so the link a caller is handed and the
  // link Scholis will honour cannot drift apart.
  const webOrigin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    url: `${webOrigin}/sso?ticket=${encodeURIComponent(token)}`,
    expiresAt: expiresAt.toISOString(),
  };
};
