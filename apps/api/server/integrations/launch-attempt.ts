import { insertLaunchToken } from '@/data/launch-tokens';
import { findTestForOrg } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { forbidden, invalidState, notFound } from '@/server/errors';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Mint a one-time link admitting a named student to a paper.
 *
 * Server to server: the integrating system calls this with its own credential
 * and then redirects the student to the URL it gets back. The secret never
 * reaches a browser, and the calling system never has to implement token
 * signing correctly — Scholis owns the expiry and the single-use guarantee.
 *
 * The student's identity travels inside the ticket rather than in the query
 * string, which is the whole point. A name in a URL is a name a student can
 * edit; a `takerRef` sealed in a ticket is what makes a mark routable back to
 * the right row in somebody's gradebook.
 */

/** Long enough to walk to the next room, short enough that a leak goes stale. */
const TICKET_TTL_MS = 15 * 60 * 1000;

export const launchAttemptInput = z.object({
  testId: z.uuid(),
  /** The caller's own student identifier. Required — that is the point. */
  takerRef: z.string().trim().min(1).max(120),
  /** Shown on screen and on the marking list. Display only. */
  takerName: z.string().trim().min(1).max(120),
});

export type LaunchAttemptInput = z.infer<typeof launchAttemptInput>;

export interface LaunchTicket {
  url: string;
  expiresAt: string;
}

export const launchAttempt = async (
  ctx: AuthedContext,
  input: LaunchAttemptInput,
): Promise<LaunchTicket> => {
  if (!ctx.actor.scopes.includes('launch:write')) {
    throw forbidden('This key cannot start attempts.');
  }

  const test = await findTestForOrg(ctx.db, input.testId, ctx.actor.orgId);
  if (test === null) throw notFound('Test');
  if (test.status !== 'published') {
    throw invalidState('That paper is not published, so nobody can sit it yet.');
  }

  const now = ctx.now();
  if (test.opensAt !== null && now < test.opensAt) {
    throw invalidState('That paper is not open yet.');
  }
  if (test.closesAt !== null && now > test.closesAt) {
    throw invalidState('That paper has closed.');
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + TICKET_TTL_MS);

  await insertLaunchToken(ctx.db, {
    orgId: ctx.actor.orgId,
    testId: test.id,
    token,
    takerRef: input.takerRef,
    takerName: input.takerName,
    expiresAt,
  });

  // Built here rather than in the route, so the link a caller is handed and
  // the link Scholis will honour cannot drift apart.
  const webOrigin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    url: `${webOrigin}/take/${encodeURIComponent(test.code)}?lt=${token}`,
    expiresAt: expiresAt.toISOString(),
  };
};
