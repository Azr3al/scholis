import { findEventById } from '@/data/events';
import {
  listDueDeliveries,
  markDeliveryFailed,
  markDelivered,
  findWebhookEndpointById,
} from '@/data/webhooks';
import type { PublicContext } from '@/server/context.types';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signPayload } from '@/server/webhook-signature';

/**
 * Sends what the event log has queued.
 *
 * Called on a timer rather than at the moment an event is written, which is
 * what keeps a slow or broken receiver from slowing down marking a paper.
 * Everything it needs is already in the database, so a process that dies
 * mid-batch loses nothing — the next pass finds the same rows still due.
 */

/** Small enough that one slow receiver cannot monopolise a pass. */
const BATCH_SIZE = 20;

/** Anything slower than this is treated as down. Exams do not wait. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Roughly 8 hours of shrinking hope before a delivery is effectively parked. */
const MAX_ATTEMPTS = 12;

/**
 * Exponential with a ceiling: 30s, 1m, 2m … capped at an hour.
 *
 * Uncapped doubling reaches days, by which point a receiver that came back is
 * still waiting for a delivery nobody is retrying.
 */
const backoffMs = (attempts: number): number =>
  Math.min(30_000 * 2 ** attempts, 60 * 60 * 1000);

export interface DeliveryReport {
  attempted: number;
  delivered: number;
  failed: number;
}

export const deliverWebhooks = async (ctx: PublicContext): Promise<DeliveryReport> => {
  const now = ctx.now();
  const due = await listDueDeliveries(ctx.db, now, BATCH_SIZE);

  const report: DeliveryReport = { attempted: 0, delivered: 0, failed: 0 };

  for (const delivery of due) {
    const [endpoint, event] = await Promise.all([
      findWebhookEndpointById(ctx.db, delivery.endpointId),
      findEventById(ctx.db, delivery.eventId),
    ]);

    // The endpoint was deleted or paused, or the event went with a deleted
    // organisation. Marked delivered rather than retried forever: there is
    // nowhere left to send it, and a row retrying into the void is noise that
    // hides the deliveries that matter.
    if (endpoint === null || !endpoint.active || event === null) {
      await markDelivered(ctx.db, delivery.id, now);
      continue;
    }

    report.attempted += 1;

    const body = JSON.stringify({
      id: event.id,
      // A string, because JSON numbers cannot hold a bigint faithfully and a
      // sequence that silently loses precision is worse than one that is
      // obviously text.
      seq: event.seq.toString(),
      type: event.type,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
    });

    const timestamp = String(now.getTime());

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signPayload(endpoint.signingSecret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        await markDelivered(ctx.db, delivery.id, now);
        report.delivered += 1;
        continue;
      }

      await fail(ctx, delivery.id, delivery.attempts, now, `HTTP ${String(response.status)}`);
      report.failed += 1;
    } catch (error) {
      // A refused connection, DNS failure or timeout. Identical handling to a
      // 500 on purpose — from here they are the same fact: it did not arrive.
      await fail(ctx, delivery.id, delivery.attempts, now, message(error));
      report.failed += 1;
    }
  }

  return report;
};

const message = (error: unknown): string =>
  error instanceof Error ? error.message : 'Delivery failed';

const fail = async (
  ctx: PublicContext,
  deliveryId: string,
  attempts: number,
  now: Date,
  reason: string,
): Promise<void> => {
  const next = attempts + 1;

  // Past the ceiling it is pushed a year out rather than deleted or flagged
  // delivered. The row stays visible and truthful — someone can see it never
  // arrived — without the pump picking it up on every pass forever.
  const delay = next >= MAX_ATTEMPTS ? 365 * 24 * 60 * 60 * 1000 : backoffMs(next);
  await markDeliveryFailed(ctx.db, deliveryId, new Date(now.getTime() + delay), reason);
};
