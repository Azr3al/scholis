'use client';

import { api } from '@/lib/api';
import type { AttemptHandle } from '@/lib/take/session';
import { isRetryable, makeSnapshot, pruneOutbox, retryDelayMs } from '@/lib/take/snapshot';
import { clearSnapshot, loadSnapshot, pruneStaleSnapshots, saveSnapshot } from '@/lib/take/store';
import { progress, reduce, type EngineEvent, type RejectionReason } from '@scholis/engine';
import type { AttemptState, Mutation, TestPackage } from '@scholis/schema';
import { useCallback, useEffect, useRef, useState } from 'react';

// 'blocked' is a refusal, not a bad connection — the session expired, or the
// paper is already in. Retrying won't help and pretending otherwise leaves the
// student answering into a void.
export type SyncStatus = 'saved' | 'saving' | 'offline' | 'blocked';

const freshState = (handle: AttemptHandle): AttemptState => ({
  attemptId: handle.attemptId,
  startedAt: handle.startedAt ?? new Date().toISOString(),
  deadlineAt: handle.serverDeadlineAt,
  cursor: 0,
  responses: {},
  markedForReview: [],
  submittedAt: null,
  clientSeq: 0,
});

// Every state transition goes through reduce(). This hook is plumbing —
// optimistic render, a durable outbox, and a retry loop. It decides nothing.
export const useAttempt = (pkg: TestPackage, handle: AttemptHandle) => {
  const [state, setState] = useState<AttemptState>(() => freshState(handle));
  const [status, setStatus] = useState<SyncStatus>('saved');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // How many answers are waiting to reach the server, and how many just got
  // there after a spell offline. Both exist only to be shown: "Offline" on its
  // own is a worry, "Offline — 3 answers saved on this device" is a fact.
  const [pending, setPending] = useState(0);
  const [recovered, setRecovered] = useState<number | null>(null);

  const outbox = useRef<Mutation[]>([]);
  const flushing = useRef(false);
  const failures = useRef(0);
  const nextAttemptAt = useRef(0);

  // Separate from `failures` on purpose. The online listener zeroes the failure
  // count to drop the backoff, and it does that *before* the flush it triggers
  // — so by the time a send succeeds there is no longer any trace that it was
  // a recovery. This flag survives that reset and nothing else reads it.
  const wasOffline = useRef(false);

  // Restore before accepting input. Answering into fresh state and then
  // loading the snapshot on top would throw away whatever was typed first.
  useEffect(() => {
    let cancelled = false;
    void loadSnapshot(handle.attemptId).then((snapshot) => {
      if (cancelled) return;
      if (snapshot !== null) {
        setState(snapshot.state);
        outbox.current = snapshot.outbox;
        if (snapshot.outbox.length > 0) setStatus('saving');
      }
      setRestored(true);
      // Swept after restoring, never before: this attempt's snapshot is far too
      // young to be a candidate, and doing it in this order means a slow sweep
      // can't hold up the answers appearing on screen.
      void pruneStaleSnapshots();
    });
    return () => {
      cancelled = true;
    };
  }, [handle.attemptId]);

  // Persist whatever the reducer last produced. Written whole, never patched.
  useEffect(() => {
    if (!restored) return;
    void saveSnapshot(makeSnapshot(handle.attemptId, state, outbox.current, new Date()));
  }, [handle.attemptId, state, restored]);

  // Questions with unsent answers — not queued mutations, which is what this
  // counted at first. Every keystroke emits its own answer mutation, so typing
  // a sentence produced "21 answers saved on this device" for one question.
  //
  // Distinct questionId is both the honest number and the one a student can
  // check against the paper in front of them. It also absorbs StrictMode's
  // double-invoked updater, which queues the same mutation twice in
  // development: same question, same count.
  //
  // Derived rather than set at each call site because the outbox is a ref
  // mutated inside a state updater, so reading it straight after dispatch
  // races the updater. Recomputing when state or status moves covers queueing,
  // flushing and restoring without depending on that ordering.
  useEffect(() => {
    // flatMap rather than filter+map: TypeScript does not narrow a union
    // through .filter, and the outbox now also carries timing and visibility
    // mutations that have no question of their own.
    const questions = outbox.current.flatMap((mutation) =>
      mutation.kind === 'answer' ? [mutation.questionId] : [],
    );
    setPending(new Set(questions).size);
  }, [state, status, restored]);

  const flush = useCallback(async () => {
    if (flushing.current || outbox.current.length === 0) return;
    if (Date.now() < nextAttemptAt.current) return;
    flushing.current = true;

    // Snapshot rather than splice — a failed send has to be retried, and
    // anything queued meanwhile must not be dropped.
    const batch = [...outbox.current];
    setStatus('saving');

    try {
      const res = await api.sync({
        attemptId: handle.attemptId,
        token: handle.token,
        mutations: batch,
      });
      const recoveredFromOutage = wasOffline.current;
      wasOffline.current = false;

      outbox.current = pruneOutbox(outbox.current, res.applied);
      failures.current = 0;
      nextAttemptAt.current = 0;
      setStatus(outbox.current.length === 0 ? 'saved' : 'saving');

      // Questions, not mutations, and only the ones the server confirmed.
      // res.applied is a list of mutation ids, and a sentence of typing is
      // dozens of those for a single question — reporting the raw length said
      // "21 answers sent" when one answer had been sent.
      if (recoveredFromOutage) {
        const confirmed = new Set(res.applied);
        const questions = batch.flatMap((mutation) =>
          mutation.kind === 'answer' && confirmed.has(mutation.id) ? [mutation.questionId] : [],
        );
        setRecovered(new Set(questions).size);
      }
      void saveSnapshot(makeSnapshot(handle.attemptId, state, outbox.current, new Date()));
    } catch (error) {
      if (!isRetryable(error)) {
        // Stop the loop and say what happened. The mutations stay queued in
        // case the page is reloaded with a fresh token.
        setSyncError(
          error instanceof Error ? error.message : 'This test session is no longer valid.',
        );
        setStatus('blocked');
        nextAttemptAt.current = Number.MAX_SAFE_INTEGER;
        return;
      }
      // Mutations stay queued. They carry ids and sequence numbers, so
      // resending the same batch is free — the server dedupes and applies
      // last-write-wins.
      failures.current += 1;
      nextAttemptAt.current = Date.now() + retryDelayMs(failures.current);
      wasOffline.current = true;
      setStatus('offline');
    } finally {
      flushing.current = false;
    }
  }, [handle.attemptId, handle.token, state]);

  useEffect(() => {
    const timer = setInterval(() => {
      void flush();
    }, 2000);
    const onOnline = () => {
      // Coming back online clears the backoff — the reason for waiting is gone.
      failures.current = 0;
      nextAttemptAt.current = 0;
      void flush();
    };
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [flush]);

  /**
   * Queue a mutation the reducer has no opinion about.
   *
   * Timing and visibility are observations, not attempt state — the reducer
   * would have nothing to decide and adding them to it would mean every
   * transition carried a clock. They still belong in the outbox, because that
   * is what makes them survive being offline, and the mutation ledger makes a
   * resend free.
   */
  const track = useCallback((mutation: Mutation) => {
    outbox.current.push(mutation);
  }, []);

  const dispatch = useCallback(
    (event: EngineEvent): RejectionReason | null => {
      let rejection: RejectionReason | null = null;

      setState((current) => {
        const result = reduce(pkg, current, event, {
          now: new Date(),
          mutationId: crypto.randomUUID(),
        });
        rejection = result.rejected;
        if (result.rejected !== null) return current;
        outbox.current.push(...result.mutations);
        return result.state;
      });

      return rejection;
    },
    [pkg],
  );

  // Ask the reducer whether an event would apply, without applying it. reduce
  // is pure, so this is a free dry run — the alternative is re-implementing
  // allowNavigation and the cursor bounds in React.
  const canDispatch = useCallback(
    (event: EngineEvent): boolean =>
      reduce(pkg, state, event, { now: new Date(), mutationId: 'dry-run' }).rejected === null,
    [pkg, state],
  );

  const submit = useCallback(async () => {
    dispatch({ t: 'submit' });
    // Outbox first — submitting with answers still queued would mark a paper
    // the server hasn't seen yet.
    await flush();
    const result = await api.submitAttempt({
      attemptId: handle.attemptId,
      token: handle.token,
    });
    // The paper is in and the server owns it now; a stale local copy would only
    // ever contradict what it says.
    await clearSnapshot(handle.attemptId);
    return result;
  }, [dispatch, flush, handle.attemptId, handle.token]);

  return {
    state,
    status,
    syncError,
    restored,
    pending,
    recovered,
    /** Retires the recovery notice once it has been shown. */
    clearRecovered: useCallback(() => {
      setRecovered(null);
    }, []),
    track,
    dispatch,
    canDispatch,
    submit,
    progress: progress(pkg, state),
  };
};
