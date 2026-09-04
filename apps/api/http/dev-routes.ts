import { auth } from '@/lib/auth';
import { setLinkCapture } from '@/lib/mail';
import { isProvisioned, provisionOrg, provisionOrgInput } from '@/server/dev/provision-org';
import { Hono } from 'hono';
import { publicContextFor } from './context';
import { devRoutesEnabled } from './dev-enabled';

export const devRoutes = new Hono();

// Belt and braces. `app.ts` doesn't mount these unless devRoutesEnabled(), so
// this should be unreachable — but the check is cheap and the failure it
// prevents isn't.
devRoutes.use('*', async (c, next) => {
  if (!devRoutesEnabled()) {
    return c.json({ error: 'not found' }, 404);
  }
  await next();
  return undefined;
});

devRoutes.post('/provision', async (c) => {
  const input = provisionOrgInput.parse(await c.req.json());
  return c.json(await provisionOrg(publicContextFor(), input));
});

// Returns the link instead of emailing it — the e2e suite has no inbox, and the
// dev mailer only prints to the terminal. Captured from the mailer rather than
// reimplementing token issuance, so the test exercises the real sign-in path.
devRoutes.post('/magic-link', async (c) => {
  const { email } = await c.req.json<{ email: string }>();

  if (!(await isProvisioned(publicContextFor(), email))) {
    return c.json({ error: 'not provisioned' }, 404);
  }

  let captured = '';
  setLinkCapture((url) => {
    captured = url;
  });

  try {
    // Without callbackURL the link redirects to the API root, which is not a
    // page. Send it to the web app instead.
    const web = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    await auth.api.signInMagicLink({
      body: { email: email.toLowerCase(), callbackURL: `${web}/teacher` },
      headers: c.req.raw.headers,
    });
  } finally {
    setLinkCapture(null);
  }

  return captured === '' ? c.json({ error: 'no link captured' }, 500) : c.json({ url: captured });
});
