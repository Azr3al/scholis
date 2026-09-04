import {
  webhookDeliveries,
  webhookEndpoints,
  type Executor,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
} from '@scholis/db';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';

export type WebhookEndpointRecord = WebhookEndpointRow;
export type WebhookDeliveryRecord = WebhookDeliveryRow;

export const insertWebhookEndpoint = async (
  db: Executor,
  values: { orgId: string; url: string; signingSecret: string },
): Promise<WebhookEndpointRecord> => {
  const [row] = await db.insert(webhookEndpoints).values(values).returning();
  if (row === undefined) throw new Error('Insert into webhook_endpoints returned no rows');
  return row;
};

export const listWebhookEndpoints = async (
  db: Executor,
  orgId: string,
): Promise<WebhookEndpointRecord[]> =>
  db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, orgId));

export const listActiveWebhookEndpoints = async (
  db: Executor,
  orgId: string,
): Promise<WebhookEndpointRecord[]> =>
  db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.active, true)));

export const findWebhookEndpointById = async (
  db: Executor,
  id: string,
): Promise<WebhookEndpointRecord | null> => {
  const [row] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, id))
    .limit(1);
  return row ?? null;
};

export const deleteWebhookEndpoint = async (db: Executor, id: string): Promise<void> => {
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
};

export const insertWebhookDelivery = async (
  db: Executor,
  values: { endpointId: string; eventId: string; seq: bigint; nextAttemptAt: Date },
): Promise<void> => {
  await db.insert(webhookDeliveries).values(values);
};

/**
 * The pump's only read: undelivered, due, oldest first.
 *
 * Ordered by `seq` so a consumer sees an organisation's events in the order
 * they happened. Delivery is still at-least-once and retries can reorder
 * across endpoints, which is why the payload carries the sequence number too.
 */
export const listDueDeliveries = async (
  db: Executor,
  now: Date,
  limit: number,
): Promise<WebhookDeliveryRecord[]> =>
  db
    .select()
    .from(webhookDeliveries)
    .where(
      and(isNull(webhookDeliveries.deliveredAt), lte(webhookDeliveries.nextAttemptAt, now)),
    )
    .orderBy(asc(webhookDeliveries.seq))
    .limit(limit);

export const markDelivered = async (db: Executor, id: string, now: Date): Promise<void> => {
  await db
    .update(webhookDeliveries)
    .set({ deliveredAt: now, attempts: sql`${webhookDeliveries.attempts} + 1`, lastError: null })
    .where(eq(webhookDeliveries.id, id));
};

/** Records the failure and pushes the next attempt out. */
export const markDeliveryFailed = async (
  db: Executor,
  id: string,
  nextAttemptAt: Date,
  error: string,
): Promise<void> => {
  await db
    .update(webhookDeliveries)
    .set({
      attempts: sql`${webhookDeliveries.attempts} + 1`,
      nextAttemptAt,
      // Truncated, because a remote server returning an HTML error page would
      // otherwise put a whole document in this column on every retry.
      lastError: error.slice(0, 500),
    })
    .where(eq(webhookDeliveries.id, id));
};
