import type { Mailer } from './mailer.types';

// Resend over plain HTTP rather than their SDK. The whole surface we use is one
// POST, and a dependency that wraps one fetch is a dependency that still has to
// be upgraded, audited, and kept in the production image.
//
// Provider-specific code stops here. Nothing outside this file knows Resend
// exists — swapping it for SES means another file like this one plus a branch
// in index.ts.
const ENDPOINT = 'https://api.resend.com/emails';

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export const createResendMailer = ({ apiKey, from }: ResendConfig): Mailer => ({
  send: async (message) => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
      }),
      // A sign-in link that takes longer than this is no use to whoever is
      // waiting on it, and Better Auth is holding a request open for us.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Body, not just status: Resend puts the actual reason (unverified
      // domain, bad key) in there, and without it this is unowned at 3pm on a
      // school day. Never includes the API key.
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend rejected the message (${String(res.status)}): ${detail}`);
    }
  },
});
