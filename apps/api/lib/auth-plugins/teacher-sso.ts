import { publicContextFor } from '@/http/context';
import { exchangeTeacherSsoTicket } from '@/server/auth/exchange-teacher-sso';
import { isDomainError } from '@/server/errors';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, formCsrfMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

/**
 * `POST /api/auth/sso/exchange` — trade a one-time ticket for a staff session.
 *
 * A Better Auth plugin rather than an ordinary Hono route, and the reason is
 * the cookie. Better Auth owns the session cookie's name, prefix, sameSite and
 * secure attributes; minting one from a route would mean Scholis holding a
 * second, silently drifting definition of them. Going through
 * `internalAdapter.createSession` plus `setSessionCookie` is the same path the
 * magic-link plugin takes, so a session created here is indistinguishable from
 * one created by any other sign-in — which is the point, because everything
 * downstream already knows how to handle it.
 *
 * The ticket itself is Scholis's, not Better Auth's. Better Auth's own
 * `oneTimeToken` plugin was considered and rejected: it stores tokens in a
 * table of its own outside the drizzle schema this project generates
 * migrations from, and its generate endpoint is oriented around an existing
 * session, where ours is minted by a machine credential on another system's
 * behalf. Keeping the ticket beside `launch_tokens` means one schema, one
 * migration chain, and one single-use claim pattern.
 *
 * `formCsrfMiddleware` and not `originCheckMiddleware`: the latter only
 * enforces when the request carries a cookie, and this is a first-login POST
 * that by definition carries none. The form middleware is Better Auth's
 * answer to exactly that case — it blocks a cross-site navigation and
 * force-validates Origin when Fetch Metadata is present, so a page on another
 * origin cannot drive a teacher's browser into accepting a session it was
 * handed.
 */
export const teacherSso = (): BetterAuthPlugin => ({
  id: 'teacher-sso',

  endpoints: {
    exchangeTeacherSso: createAuthEndpoint(
      '/sso/exchange',
      {
        method: 'POST',
        use: [formCsrfMiddleware],
        body: z.object({
          ticket: z.string().min(1).max(200),
        }),
      },
      async (ctx) => {
        let userId: string;
        try {
          const exchanged = await exchangeTeacherSsoTicket(publicContextFor(), {
            ticket: ctx.body.ticket,
          });
          userId = exchanged.userId;
        } catch (error) {
          // Our DomainError carries the message a teacher should see. Better
          // Auth would otherwise turn an unrecognised throw into a 500, so it
          // is translated here rather than left to fall out of the handler.
          if (isDomainError(error)) {
            throw APIError.fromStatus('FORBIDDEN', { message: error.publicMessage });
          }
          throw error;
        }

        const user = await ctx.context.internalAdapter.findUserById(userId);
        if (!user) {
          // Unreachable in practice: the ticket's user_id is a cascading
          // foreign key, so deleting the teacher deletes the ticket. Checked
          // anyway, because "impossible" is not a reason to hand Better Auth a
          // null and see what it does.
          throw APIError.fromStatus('FORBIDDEN', {
            message: 'That sign-in link is no longer valid.',
          });
        }

        // `createSession` is typed `Promise<Session>`, not nullable, so there is
        // no missing-session branch to guard — unlike `findUserById` above.
        // Better Auth's own magic-link plugin checks it anyway because its
        // handler predates that typing; here the compiler is the check.
        const session = await ctx.context.internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });

        // Deliberately thin. The cookie is the payload; the browser is about to
        // be redirected into the teacher app, which will read the session like
        // any other sign-in.
        return ctx.json({ status: true });
      },
    ),
  },

  // A 32-byte random token is not guessable, so this is not the defence — it is
  // the thing that makes hammering the endpoint expensive and visible. Ten per
  // minute leaves room for a teacher who reloads a stale link once or twice.
  rateLimit: [
    {
      pathMatcher: (path) => path.startsWith('/sso/exchange'),
      window: 60,
      max: 10,
    },
  ],
});
