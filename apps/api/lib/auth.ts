import { accounts, sessions, users, verifications } from '@scholis/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { getDb, requireEnv } from './db';
import { createMailer } from './mail';

// Teacher/admin auth. Students never touch this — they arrive with a code.
//
// Better Auth's user model maps onto our existing `users` table, so org_id
// stays where the domain put it.
//
// Sign-in authenticates, it never provisions. Orgs and members come from the
// admin script, so an unknown address is rejected rather than onboarded.
export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),

  secret: requireEnv('AUTH_SECRET'),
  baseURL: process.env.AUTH_URL ?? 'http://localhost:3001',

  // Web is a different origin. localhost:3000 and :3001 are still same-site, so
  // lax works in dev — and in prod too, as long as both stay on one registrable
  // domain (app.scholis.com / api.scholis.com). Put them on genuinely different
  // domains and this needs sameSite:'none' + secure.
  trustedOrigins: [process.env.WEB_ORIGIN ?? 'http://localhost:3000'],
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },

  // No password auth. A magic link proves control of the address without giving
  // a school one more credential to leak.
  emailAndPassword: { enabled: false },

  databaseHooks: {
    user: {
      create: {
        // The actual guarantee. disableSignUp below says the same thing, but it's a
        // plugin option a future upgrade or second provider could quietly bypass.
        // This sits on the write itself.
        before: () => {
          throw new Error(
            'Sign-in must not create users. Accounts are provisioned by an administrator.',
          );
        },
      },
    },
  },

  plugins: [
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        await createMailer().send({
          to: email,
          subject: 'Your Scholis sign-in link',
          text: [
            'Sign in to Scholis by opening the link below.',
            '',
            url,
            '',
            'The link expires shortly and can be used once.',
            'If you did not request it, you can ignore this email.',
          ].join('\n'),
        });
      },
    }),
  ],

  // Google is deliberately absent until requirements are confirmed. Adding it
  // is a `socialProviders` entry plus credentials — the `accounts` table that
  // would store the linkage already exists, so it is not a migration.
});

export type Session = typeof auth.$Infer.Session;
