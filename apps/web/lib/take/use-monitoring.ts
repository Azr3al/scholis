'use client';

import type { Mutation } from '@scholis/schema';
import { useCallback, useEffect, useRef } from 'react';

/**
 * What the browser can honestly observe about a taker leaving the test, and
 * how long they spent on each question.
 *
 * Deliberately modest about what it claims. `visibilitychange` fires when the
 * tab is backgrounded or the screen locks; `blur` fires when the window loses
 * focus, which a notification also causes. None of it distinguishes reading a
 * textbook from reading a second monitor, and nothing here pretends otherwise
 * — the teacher gets timestamps, not a verdict.
 *
 * Both signals ride the existing outbox, so an event recorded with no
 * connection is not lost and a resend cannot double-count it.
 */

/** Below this, a "visit" is a mis-click on the way somewhere else. */
const MIN_REPORTABLE_MS = 750;

/** Matches the server's clamp. A tab left open overnight is not study time. */
const MAX_SEGMENT_MS = 30 * 60 * 1000;

export interface MonitoringInput {
  attemptId: string;
  /** Question currently on screen, or undefined before the paper loads. */
  questionId: string | undefined;
  track: (mutation: Mutation) => void;
  /** Stops all observation once the paper is in. */
  active: boolean;
}

export interface Monitoring {
  /**
   * Banks the open segment now. Called before handing in: the paper is closed
   * to mutations the moment it is submitted, so time flushed on unmount arrives
   * too late and is refused.
   */
  flush: () => void;
}

export const useMonitoring = ({
  attemptId,
  questionId,
  track,
  active,
}: MonitoringInput): Monitoring => {
  // Refs throughout: none of this should cause a render, and a timer closing
  // over stale state would bank time against the wrong question.
  const currentQuestion = useRef<string | undefined>(undefined);
  const segmentStart = useRef<number | null>(null);
  const seq = useRef(0);

  const trackRef = useRef(track);
  trackRef.current = track;

  // Held so the hand-in path can bank the last segment. Set by the effect below
  // rather than duplicated, so there is only ever one flush implementation.
  const flushRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!active) return;

    const flushSegment = () => {
      const question = currentQuestion.current;
      const start = segmentStart.current;
      segmentStart.current = null;
      if (question === undefined || start === null) return;

      const elapsed = Math.min(Date.now() - start, MAX_SEGMENT_MS);
      if (elapsed < MIN_REPORTABLE_MS) return;

      seq.current += 1;
      trackRef.current({
        kind: 'timing',
        id: crypto.randomUUID(),
        attemptId,
        questionId: question,
        msDelta: elapsed,
        clientSeq: seq.current,
        at: new Date().toISOString(),
      });
    };

    flushRef.current = flushSegment;

    const note = (state: 'hidden' | 'visible' | 'blur' | 'focus') => {
      seq.current += 1;
      trackRef.current({
        kind: 'visibility',
        id: crypto.randomUUID(),
        attemptId,
        state,
        clientSeq: seq.current,
        at: new Date().toISOString(),
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Bank what they had before they left, then stop the clock. Time spent
        // looking at something else is not time spent on the question.
        flushSegment();
        note('hidden');
      } else {
        note('visible');
        if (currentQuestion.current !== undefined) segmentStart.current = Date.now();
      }
    };

    const onBlur = () => {
      flushSegment();
      note('blur');
    };

    const onFocus = () => {
      note('focus');
      if (currentQuestion.current !== undefined && document.visibilityState === 'visible') {
        segmentStart.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    // Last chance to bank the open segment. pagehide fires where beforeunload
    // is unreliable, and both are best-effort — anything not flushed here is
    // simply time we cannot honestly claim.
    window.addEventListener('pagehide', flushSegment);

    return () => {
      flushSegment();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', flushSegment);
    };
  }, [attemptId, active]);

  // Moving to another question closes the previous segment and opens a new one.
  // Returning later opens another, and the server adds them up.
  useEffect(() => {
    if (!active) return;

    const previous = currentQuestion.current;
    if (previous === questionId) {
      // Same question, but the clock may have been stopped by the listener
      // effect's cleanup — it banks the open segment whenever it re-runs, and
      // nothing else would start it again. Left alone this loses the very first
      // segment of the paper, which is the one every student has.
      if (
        questionId !== undefined &&
        segmentStart.current === null &&
        document.visibilityState === 'visible'
      ) {
        segmentStart.current = Date.now();
      }
      return;
    }

    const start = segmentStart.current;
    if (previous !== undefined && start !== null) {
      const elapsed = Math.min(Date.now() - start, MAX_SEGMENT_MS);
      if (elapsed >= MIN_REPORTABLE_MS) {
        seq.current += 1;
        trackRef.current({
          kind: 'timing',
          id: crypto.randomUUID(),
          attemptId,
          questionId: previous,
          msDelta: elapsed,
          clientSeq: seq.current,
          at: new Date().toISOString(),
        });
      }
    }

    currentQuestion.current = questionId;
    segmentStart.current =
      questionId !== undefined && document.visibilityState === 'visible' ? Date.now() : null;
  }, [attemptId, questionId, active]);

  return {
    flush: useCallback(() => {
      flushRef.current();
    }, []),
  };
};
