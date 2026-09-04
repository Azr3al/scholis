import { appendEvent } from '@/data/events';
import { listDueDeliveries } from '@/data/webhooks';
import type { AuthedContext } from '@/server/context.types';
import { authedContext, publicContext } from '@/test/support';
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from '@/server/webhook-signature';
import { createTestDb, makeOrg, makeUser, type TestDb } from '@scholis/db/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverWebhooks } from './deliver-webhooks';
import { addWebhook, listEvents, listWebhooks, removeWebhook } from './manage-webhooks';

const harness: TestDb = await createTestDb();

afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const asOwner = async (): Promise<AuthedContext> => {
  const org = await makeOrg(harness.db);
  const user = await makeUser(harness.db, org.id, { role: 'owner' });
  return authedContext(harness.db, { userId: user.id, orgId: org.id, role: 'owner' });
};

interface Captured {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** Stands in for the receiving system. */
const stubReceiver = (respond: () => Response): Captured[] => {
  const calls: Captured[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: typeof init.body === 'string' ? init.body : '',
      headers: init.headers as Record<string, string>,
    });
    return Promise.resolve(respond());
  });
  return calls;
};

const emit = async (orgId: string, now = new Date('2026-08-07T10:00:00.000Z')) =>
  appendEvent(harness.db, {
    orgId,
    type: 'attempt.released.v1',
    subjectType: 'attempt',
    subjectId: '11111111-1111-4111-8111-111111111111',
    payload: { testId: 'a-test' },
    now,
  });

describe('queueing', () => {
  it('queues a delivery for each active endpoint, in the same breath as the event', async () => {
    const ctx = await asOwner();
    await addWebhook(ctx, { url: 'https://schedjuice.test/hooks/a' });
    await addWebhook(ctx, { url: 'https://schedjuice.test/hooks/b' });

    await emit(ctx.actor.orgId);

    const due = await listDueDeliveries(harness.db, new Date('2026-08-07T10:00:01.000Z'), 10);
    expect(due).toHaveLength(2);
  });

  it('queues nothing for an organisation with no endpoint', async () => {
    const ctx = await asOwner();
    await emit(ctx.actor.orgId);

    expect(await listDueDeliveries(harness.db, new Date('2026-08-07T10:00:01.000Z'), 10)).toEqual(
      [],
    );
  });

  it('does not queue one school\'s event to another school\'s endpoint', async () => {
    const ours = await asOwner();
    const theirs = await asOwner();
    await addWebhook(theirs, { url: 'https://elsewhere.test/hooks' });

    await emit(ours.actor.orgId);

    expect(await listDueDeliveries(harness.db, new Date('2026-08-07T10:00:01.000Z'), 10)).toEqual(
      [],
    );
  });
});

describe('delivering', () => {
  it('posts a signed body the receiver can verify', async () => {
    const ctx = await asOwner();
    const endpoint = await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    await emit(ctx.actor.orgId);

    const calls = stubReceiver(() => new Response('ok', { status: 200 }));
    const report = await deliverWebhooks(publicContext(harness.db));

    expect(report).toEqual({ attempted: 1, delivered: 1, failed: 0 });

    const call = calls[0];
    expect(call?.url).toBe('https://schedjuice.test/hooks');

    // Verified with the shared helper rather than a re-implementation, so this
    // proves what a real receiver would actually compute.
    const ok = verifySignature(
      endpoint.signingSecret,
      call?.headers[TIMESTAMP_HEADER] ?? '',
      call?.body ?? '',
      call?.headers[SIGNATURE_HEADER] ?? '',
    );
    expect(ok).toBe(true);
  });

  it('signs the timestamp too, so a captured delivery cannot be replayed forever', async () => {
    const ctx = await asOwner();
    const endpoint = await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    await emit(ctx.actor.orgId);

    const calls = stubReceiver(() => new Response('ok', { status: 200 }));
    await deliverWebhooks(publicContext(harness.db));

    const call = calls[0];
    // Same body, a later timestamp: the signature must no longer match.
    const forged = verifySignature(
      endpoint.signingSecret,
      String(Number(call?.headers[TIMESTAMP_HEADER] ?? '0') + 60_000),
      call?.body ?? '',
      call?.headers[SIGNATURE_HEADER] ?? '',
    );
    expect(forged).toBe(false);
  });

  it('carries the sequence number as a string', async () => {
    // A bigint does not survive JSON as a number, and a sequence that silently
    // loses precision is worse than one that is obviously text.
    const ctx = await asOwner();
    await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    await emit(ctx.actor.orgId);

    const calls = stubReceiver(() => new Response('ok', { status: 200 }));
    await deliverWebhooks(publicContext(harness.db));

    const body = JSON.parse(calls[0]?.body ?? '{}') as { seq: unknown; type: string };
    expect(typeof body.seq).toBe('string');
    expect(body.type).toBe('attempt.released.v1');
  });

  it('retries later when the receiver is down, without losing the delivery', async () => {
    const ctx = await asOwner();
    await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    await emit(ctx.actor.orgId);

    stubReceiver(() => new Response('nope', { status: 500 }));
    const report = await deliverWebhooks(publicContext(harness.db));
    expect(report.failed).toBe(1);

    // Not due again immediately — that is the backoff doing its job.
    const soon = await listDueDeliveries(harness.db, new Date('2026-08-07T10:00:05.000Z'), 10);
    expect(soon).toEqual([]);

    // Still there, still undelivered, and it comes back round later.
    const later = await listDueDeliveries(harness.db, new Date('2026-08-07T11:00:00.000Z'), 10);
    expect(later).toHaveLength(1);
    expect(later[0]?.attempts).toBe(1);
    expect(later[0]?.lastError).toContain('500');
  });

  it('treats a refused connection the same as a 500', async () => {
    const ctx = await asOwner();
    await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    await emit(ctx.actor.orgId);

    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));
    const report = await deliverWebhooks(publicContext(harness.db));

    // From here they are the same fact: it did not arrive.
    expect(report.failed).toBe(1);
    const later = await listDueDeliveries(harness.db, new Date('2026-08-07T11:00:00.000Z'), 10);
    expect(later[0]?.lastError).toContain('ECONNREFUSED');
  });

  it('sends each delivery once', async () => {
    const ctx = await asOwner();
    await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    await emit(ctx.actor.orgId);

    const calls = stubReceiver(() => new Response('ok', { status: 200 }));
    await deliverWebhooks(publicContext(harness.db));
    await deliverWebhooks(publicContext(harness.db));

    expect(calls).toHaveLength(1);
  });

  it('stops trying once the endpoint is removed', async () => {
    const ctx = await asOwner();
    const endpoint = await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    await emit(ctx.actor.orgId);
    await removeWebhook(ctx, { endpointId: endpoint.id });

    const calls = stubReceiver(() => new Response('ok', { status: 200 }));
    const report = await deliverWebhooks(publicContext(harness.db));

    expect(calls).toHaveLength(0);
    expect(report.attempted).toBe(0);
  });
});

describe('managing endpoints', () => {
  it('shows the signing secret once and never again', async () => {
    const ctx = await asOwner();
    const created = await addWebhook(ctx, { url: 'https://schedjuice.test/hooks' });
    expect(created.signingSecret).not.toBe('');

    const listed = await listWebhooks(ctx);
    expect(JSON.stringify(listed)).not.toContain(created.signingSecret);
  });

  it('refuses plain http, which would put marks on the wire in clear', async () => {
    const ctx = await asOwner();
    await expect(addWebhook(ctx, { url: 'http://schedjuice.test/hooks' })).rejects.toThrow(
      /must use https/i,
    );
  });

  it('allows localhost, because that is where a developer\'s receiver lives', async () => {
    const ctx = await asOwner();
    const created = await addWebhook(ctx, { url: 'http://localhost:4000/hooks' });
    expect(created.url).toContain('localhost');
  });

  it('will not remove another school\'s endpoint', async () => {
    const ours = await asOwner();
    const theirs = await asOwner();
    const endpoint = await addWebhook(theirs, { url: 'https://elsewhere.test/hooks' });

    await expect(removeWebhook(ours, { endpointId: endpoint.id })).rejects.toThrow(/not found/i);
  });
});

describe('catching up', () => {
  it('reads forward from the last sequence handled', async () => {
    const ctx = await asOwner();
    const first = await emit(ctx.actor.orgId, new Date('2026-08-07T10:00:00.000Z'));
    const second = await emit(ctx.actor.orgId, new Date('2026-08-07T10:05:00.000Z'));

    const page = await listEvents(ctx, { since: first.seq.toString() });

    expect(page.events).toHaveLength(1);
    expect(page.events[0]?.id).toBe(second.id);
  });

  it('starts from the beginning when nothing has been handled', async () => {
    const ctx = await asOwner();
    await emit(ctx.actor.orgId);

    const page = await listEvents(ctx, {});
    expect(page.events).toHaveLength(1);
  });

  it('offers a cursor only when there may be more', async () => {
    const ctx = await asOwner();
    await emit(ctx.actor.orgId);
    await emit(ctx.actor.orgId, new Date('2026-08-07T10:05:00.000Z'));

    // A full page: there might be more behind it.
    const full = await listEvents(ctx, { limit: 2 });
    expect(full.nextSince).not.toBeNull();

    // A short page means caught up, and handing back a cursor would invite a
    // pointless extra round trip.
    const short = await listEvents(ctx, { limit: 50 });
    expect(short.nextSince).toBeNull();
  });

  it('shows one school nothing of another', async () => {
    const ours = await asOwner();
    const theirs = await asOwner();
    await emit(theirs.actor.orgId);

    expect((await listEvents(ours, {})).events).toEqual([]);
  });
});
