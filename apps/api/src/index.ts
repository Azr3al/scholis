import { api } from '@/http/app';
import { publicContextFor } from '@/http/context';
import { requireEnv } from '@/lib/db';
import { createMailer } from '@/lib/mail';
import { deliverWebhooks } from '@/server/integrations/deliver-webhooks';
import { serve } from '@hono/node-server';

// Fail on boot rather than on first use. Everything checked here is read lazily
// somewhere deeper — the database handle when a request arrives, the mail
// provider when someone signs in — so a missing value would otherwise surface
// as a broken sign-in on a school morning rather than as a failed deploy.
const checkConfiguration = (): void => {
  requireEnv('DATABASE_URL');
  requireEnv('AUTH_SECRET');
  requireEnv('ATTEMPT_TOKEN_SECRET');

  // Build the mailer and throw it away. Resolving the provider name alone
  // wasn't enough: MAIL_PROVIDER=resend with no RESEND_API_KEY resolved fine
  // and only failed when the first teacher tried to sign in. Constructing the
  // adapter runs its own configuration checks and sends nothing.
  createMailer();
};

try {
  checkConfiguration();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

// Standalone now that the API isn't mounted inside Next. Railway sets PORT.
const port = Number(process.env.PORT ?? 3001);

// 0.0.0.0 because the platform reaches the container from outside it; the
// default binding would leave health checks talking to nothing.
serve({ fetch: api.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.warn(`API listening on port ${String(info.port)}`);
});

/**
 * Webhook delivery, pumped in-process on a timer.
 *
 * Here rather than in a separate worker because this is a handful of HTTP
 * calls a minute, not a job queue, and a second service to deploy and watch
 * would cost more than it saves. Every bit of state lives in
 * `webhook_deliveries`, so a pass that dies mid-batch loses nothing and two
 * replicas racing the same row cost one duplicate delivery — which consumers
 * already tolerate, because delivery is at-least-once by design.
 */
const PUMP_INTERVAL_MS = 15_000;

const pump = setInterval(() => {
  void deliverWebhooks(publicContextFor()).catch((error: unknown) => {
    // Logged and swallowed. Each delivery's own failure is already recorded in
    // the database; letting this escape a timer would take the whole API down
    // because one school's receiver is misbehaving.
    console.error('Webhook delivery failed:', error instanceof Error ? error.message : error);
  });
}, PUMP_INTERVAL_MS);

// Never hold the process open on shutdown.
pump.unref();
