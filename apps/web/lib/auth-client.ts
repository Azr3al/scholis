import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Same origin rule as `lib/api.ts`, and for the same reason.
 *
 * This client only ever runs in the browser — `useSession` and `signOut` are
 * React hooks — so it talks to the web origin and lets the rewrite in
 * `next.config.ts` forward to the API. Pointing it at the API origin directly
 * made every session read cross-site: the cookie the API set was host-only on
 * its own origin, so `useSession` saw no session even immediately after a
 * successful sign-in, and `signOut` cleared a cookie the browser was not
 * sending in the first place.
 */
export const authClient = createAuthClient({
  baseURL: '',
  basePath: '/api/auth',
  plugins: [magicLinkClient()],
});

export const { useSession, signOut } = authClient;
