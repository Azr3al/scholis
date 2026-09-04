import {
  deleteWebhookEndpoint,
  findWebhookEndpointById,
  insertWebhookEndpoint,
  listWebhookEndpoints,
} from '@/data/webhooks';
import { listEventsForOrgSince } from '@/data/events';
import type { AuthedContext } from '@/server/context.types';
import { forbidden, notFound, validationFailed } from '@/server/errors';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Where an organisation wants its events sent, and what it missed.
 */

export interface EndpointSummary {
  id: string;
  url: string;
  active: boolean;
  createdAt: string;
}

export interface CreatedEndpoint extends EndpointSummary {
  /**
   * Shown once. The receiver needs it to verify signatures, and unlike an API
   * key we do have to store it — a signature has to be reproduced, not merely
   * compared — but there is still no reason to hand it out twice.
   */
  signingSecret: string;
}

// --- create ----------------------------------------------------------------

export const addWebhookInput = z.object({
  url: z.url(),
});

export const addWebhook = async (
  ctx: AuthedContext,
  input: z.infer<typeof addWebhookInput>,
): Promise<CreatedEndpoint> => {
  if (ctx.actor.kind !== 'user' && !ctx.actor.scopes.includes('results:read')) {
    throw forbidden('This key cannot manage webhooks.');
  }

  // Plain http would put students' marks on the wire in clear text. Localhost
  // is allowed because that is where a developer's receiver lives.
  const url = new URL(input.url);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) {
    throw validationFailed('Webhook URLs must use https.');
  }

  const endpoint = await insertWebhookEndpoint(ctx.db, {
    orgId: ctx.actor.orgId,
    url: input.url,
    signingSecret: randomBytes(32).toString('base64url'),
  });

  return {
    id: endpoint.id,
    url: endpoint.url,
    active: endpoint.active,
    createdAt: endpoint.createdAt.toISOString(),
    signingSecret: endpoint.signingSecret,
  };
};

// --- list ------------------------------------------------------------------

export const listWebhooks = async (ctx: AuthedContext): Promise<EndpointSummary[]> => {
  const endpoints = await listWebhookEndpoints(ctx.db, ctx.actor.orgId);
  // No signing secret here. It is shown once at creation and never again.
  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    url: endpoint.url,
    active: endpoint.active,
    createdAt: endpoint.createdAt.toISOString(),
  }));
};

// --- remove ----------------------------------------------------------------

export const removeWebhookInput = z.object({ endpointId: z.uuid() });

export const removeWebhook = async (
  ctx: AuthedContext,
  input: z.infer<typeof removeWebhookInput>,
): Promise<{ removed: true }> => {
  const endpoint = await findWebhookEndpointById(ctx.db, input.endpointId);
  if (endpoint?.orgId !== ctx.actor.orgId) throw notFound('Webhook');

  await deleteWebhookEndpoint(ctx.db, endpoint.id);
  return { removed: true };
};

// --- reconcile -------------------------------------------------------------

export const listEventsInput = z.object({
  /** Exclusive. Send the highest sequence number already processed. */
  since: z.string().regex(/^\d+$/).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export interface EventPage {
  events: {
    id: string;
    seq: string;
    type: string;
    subjectType: string;
    subjectId: string;
    payload: Record<string, unknown>;
    occurredAt: string;
  }[];
  /** Feed back as `since` to continue. Null when caught up. */
  nextSince: string | null;
}

/**
 * The catch-up path behind at-least-once delivery.
 *
 * A consumer that missed a webhook — endpoint down for an hour, receiver
 * redeployed mid-batch — reads forward from the last sequence it handled
 * rather than waiting for retries it cannot see the state of.
 */
export const listEvents = async (
  ctx: AuthedContext,
  input: z.infer<typeof listEventsInput>,
): Promise<EventPage> => {
  if (!ctx.actor.scopes.includes('results:read') && ctx.actor.kind !== 'user') {
    throw forbidden('This key cannot read events.');
  }

  const limit = input.limit ?? 100;
  const rows = await listEventsForOrgSince(
    ctx.db,
    ctx.actor.orgId,
    BigInt(input.since ?? '0'),
    limit,
  );

  return {
    events: rows.map((event) => ({
      id: event.id,
      // A string for the same reason the webhook body uses one: a bigint does
      // not survive JSON as a number.
      seq: event.seq.toString(),
      type: event.type,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
    })),
    // Only when the page was full. A short page means there is nothing more
    // yet, and handing back a cursor would invite a pointless extra round trip.
    nextSince: rows.length === limit ? (rows.at(-1)?.seq.toString() ?? null) : null,
  };
};
