"use client";

import { axiosClient } from "@/lib/api";
import type { QuestionTypeV3, QuizTakeSavedAnswers } from "@/types/quiz-v3";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { writeMirror } from "./quiz-autosave-mirror";
import {
  buildAnswersPayload,
  buildMarkedReviewPayload,
  type ProgressPatchBody,
} from "./quiz-taker-progress-payload";
import type { QuizQuestionPlayerAnswerValue } from "./use-quiz-question-player-answers";

const PROGRESS_DEBOUNCE_MS = 750;
const MIRROR_THROTTLE_MS = 200;
const RETRY_DELAYS_MS = [1000, 3000, 8000] as const;

export type AutosaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  | "error";

export type UseQuizAutosaveArgs = {
  code: string;
  attemptId: number | null;
  questions: QuestionTypeV3[];
  answers: Record<number, QuizQuestionPlayerAnswerValue>;
  markedReview: Record<number, boolean>;
  /** False until parent opens the gate (~150ms after server hydrate). */
  allowAutosave: boolean;
  submitIsPending: boolean;
};

export type UseQuizAutosaveResult = {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  retryNow: () => void;
  waitForFlush: (timeoutMs: number) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function useQuizAutosave({
  code,
  attemptId,
  questions,
  answers,
  markedReview,
  allowAutosave,
  submitIsPending,
}: UseQuizAutosaveArgs): UseQuizAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const statusRef = useRef<AutosaveStatus>("idle");
  statusRef.current = status;

  const lastProgressPayloadRef = useRef<ProgressPatchBody | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const mirrorThrottleRef = useRef<number | null>(null);
  const retryTimeoutsRef = useRef<number[]>([]);
  const retryIndexRef = useRef(0);
  const serverSyncedAtRef = useRef<number | null>(null);
  const errorOnlineRetryUsedRef = useRef(false);
  const patchChainRef = useRef(Promise.resolve());
  const allowAutosaveRef = useRef(allowAutosave);
  allowAutosaveRef.current = allowAutosave;
  const submitPendingRef = useRef(submitIsPending);
  submitPendingRef.current = submitIsPending;
  const attemptIdRef = useRef(attemptId);
  attemptIdRef.current = attemptId;
  const codeRef = useRef(code);
  codeRef.current = code;

  const clearRetryTimeouts = useCallback(() => {
    for (const id of retryTimeoutsRef.current) window.clearTimeout(id);
    retryTimeoutsRef.current = [];
  }, []);

  const buildBody = useCallback((): ProgressPatchBody | null => {
    if (attemptId == null) return null;
    return {
      attempt_id: attemptId,
      answers: buildAnswersPayload(questions, answers),
      marked_review: buildMarkedReviewPayload(questions, markedReview),
    };
  }, [attemptId, questions, answers, markedReview]);

  const progressMutation = useMutation({
    mutationFn: async (body: ProgressPatchBody) => {
      lastProgressPayloadRef.current = body;
      return axiosClient.patch(
        `quizzes/take/${codeRef.current}/progress`,
        body,
      );
    },
    retry: false,
  });

  const mutateAsync = progressMutation.mutateAsync;

  const writeMirrorFromBody = useCallback(
    (body: ProgressPatchBody, syncedAt: number | null) => {
      const aid = attemptIdRef.current;
      if (aid == null) return;
      const now = Date.now();
      writeMirror(sessionStorage, codeRef.current, aid, {
        attempt_id: aid,
        answers: body.answers as Record<
          string,
          QuizTakeSavedAnswers[string]
        >,
        marked_review: body.marked_review,
        written_at: now,
        server_synced_at: syncedAt,
      });
    },
    [],
  );

  const enqueuePatchRef = useRef<(body: ProgressPatchBody) => Promise<void>>(
    async () => {
      await Promise.resolve();
    },
  );

  const scheduleRetries = useCallback((body: ProgressPatchBody) => {
    const idx = retryIndexRef.current;
    if (idx >= RETRY_DELAYS_MS.length) {
      setStatus("error");
      statusRef.current = "error";
      return;
    }
    const delay = RETRY_DELAYS_MS[idx];
    retryIndexRef.current = idx + 1;
    const tid = window.setTimeout(() => {
      if (!navigator.onLine) return;
      if (submitPendingRef.current) return;
      const latest = lastProgressPayloadRef.current ?? body;
      void enqueuePatchRef.current(latest);
    }, delay);
    retryTimeoutsRef.current.push(tid);
  }, []);

  const sendProgressBody = useCallback(
    async (body: ProgressPatchBody): Promise<void> => {
      setStatus("saving");
      statusRef.current = "saving";
      try {
        await mutateAsync(body);
        const synced = Date.now();
        serverSyncedAtRef.current = synced;
        setLastSavedAt(synced);
        setStatus("saved");
        statusRef.current = "saved";
        retryIndexRef.current = 0;
        errorOnlineRetryUsedRef.current = false;
        writeMirrorFromBody(body, synced);

        const freshAid = attemptIdRef.current;
        const freshQs = questions;
        const freshAns = answers;
        const freshMr = markedReview;
        if (
          freshAid == null ||
          submitPendingRef.current ||
          !navigator.onLine
        ) {
          return;
        }
        const freshBody: ProgressPatchBody = {
          attempt_id: freshAid,
          answers: buildAnswersPayload(freshQs, freshAns),
          marked_review: buildMarkedReviewPayload(freshQs, freshMr),
        };
        if (JSON.stringify(freshBody) !== JSON.stringify(body)) {
          await enqueuePatchRef.current(freshBody);
        }
      } catch {
        if (!navigator.onLine) {
          setStatus("offline");
          statusRef.current = "offline";
          clearRetryTimeouts();
          retryIndexRef.current = 0;
          return;
        }
        scheduleRetries(body);
      }
    },
    [
      mutateAsync,
      questions,
      answers,
      markedReview,
      writeMirrorFromBody,
      scheduleRetries,
      clearRetryTimeouts,
    ],
  );

  const enqueuePatch = useCallback(
    (body: ProgressPatchBody): Promise<void> => {
      lastProgressPayloadRef.current = body;
      const next = patchChainRef.current
        .catch(() => undefined)
        .then(() => sendProgressBody(body));
      patchChainRef.current = next.catch(() => undefined);
      return next;
    },
    [sendProgressBody],
  );

  enqueuePatchRef.current = enqueuePatch;

  /** Reset queued saves when quiz code / attempt identity changes */
  useEffect(() => {
    patchChainRef.current = Promise.resolve();
    clearRetryTimeouts();
    retryIndexRef.current = 0;
    errorOnlineRetryUsedRef.current = false;
    serverSyncedAtRef.current = null;
    lastProgressPayloadRef.current = null;
    setLastSavedAt(null);
    setStatus("idle");
    statusRef.current = "idle";
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [code, attemptId, clearRetryTimeouts]);

  /** Throttled mirror with current local state (unsynced until PATCH ack updates server_synced_at). */
  useEffect(() => {
    const aid = attemptId;
    if (aid == null) return;
    const body = buildBody();
    if (!body) return;
    window.clearTimeout(mirrorThrottleRef.current ?? 0);
    mirrorThrottleRef.current = window.setTimeout(() => {
      writeMirror(sessionStorage, code, aid, {
        attempt_id: aid,
        answers: body.answers as Record<
          string,
          QuizTakeSavedAnswers[string]
        >,
        marked_review: body.marked_review,
        written_at: Date.now(),
        server_synced_at: serverSyncedAtRef.current,
      });
    }, MIRROR_THROTTLE_MS);
    return () => {
      window.clearTimeout(mirrorThrottleRef.current ?? 0);
      mirrorThrottleRef.current = null;
    };
  }, [answers, markedReview, attemptId, code, buildBody]);

  /** Debounced progress save. */
  useEffect(() => {
    clearRetryTimeouts();
    retryIndexRef.current = 0;

    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (
      attemptId == null ||
      !allowAutosave ||
      submitIsPending ||
      !navigator.onLine
    ) {
      return;
    }

    const body = buildBody();
    if (!body) return;

    debounceTimerRef.current = window.setTimeout(() => {
      const fresh = buildBody();
      if (fresh) void enqueuePatch(fresh);
      debounceTimerRef.current = null;
    }, PROGRESS_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    answers,
    markedReview,
    questions,
    attemptId,
    allowAutosave,
    submitIsPending,
    code,
    buildBody,
    enqueuePatch,
    clearRetryTimeouts,
  ]);

  /** Offline / online. */
  useEffect(() => {
    const resolveBody = (): ProgressPatchBody | null =>
      attemptIdRef.current != null
        ? {
            attempt_id: attemptIdRef.current,
            answers: buildAnswersPayload(
              questions,
              answers,
            ),
            marked_review: buildMarkedReviewPayload(
              questions,
              markedReview,
            ),
          }
        : null;

    const onOffline = () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      clearRetryTimeouts();
      retryIndexRef.current = 0;
      setStatus((prev) => {
        const next = prev === "error" ? "error" : "offline";
        statusRef.current = next;
        return next;
      });
    };

    const onOnline = () => {
      const s = statusRef.current;
      if (
        s === "offline" &&
        allowAutosaveRef.current &&
        attemptIdRef.current != null &&
        !submitPendingRef.current
      ) {
        setStatus("saving");
        statusRef.current = "saving";
        const fresh = resolveBody();
        if (fresh) void enqueuePatch(fresh);
        return;
      }
      if (s === "error" && !errorOnlineRetryUsedRef.current) {
        errorOnlineRetryUsedRef.current = true;
        const retryBody =
          lastProgressPayloadRef.current ??
          resolveBody() ??
          undefined;
        if (
          retryBody &&
          attemptIdRef.current != null &&
          allowAutosaveRef.current &&
          !submitPendingRef.current
        ) {
          setStatus("saving");
          statusRef.current = "saving";
          void enqueuePatch(retryBody);
        }
      }
    };

    if (typeof window === "undefined") return;
    if (!navigator.onLine && statusRef.current !== "error") {
      setStatus("offline");
      statusRef.current = "offline";
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [questions, answers, markedReview, enqueuePatch, clearRetryTimeouts]);

  const retryNow = useCallback(() => {
    clearRetryTimeouts();
    retryIndexRef.current = 0;
    errorOnlineRetryUsedRef.current = false;
    const body =
      lastProgressPayloadRef.current ?? buildBody() ?? undefined;
    if (
      body &&
      attemptId != null &&
      allowAutosave &&
      !submitIsPending &&
      navigator.onLine
    ) {
      void enqueuePatch(body);
    }
  }, [
    attemptId,
    allowAutosave,
    submitIsPending,
    buildBody,
    enqueuePatch,
    clearRetryTimeouts,
  ]);

  const waitForFlush = useCallback(
    async (timeoutMs: number) => {
      if (attemptId == null) return;
      if (statusRef.current === "offline" || statusRef.current === "error") {
        return;
      }

      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const body = buildBody();
      if (!body) return;

      lastProgressPayloadRef.current = body;
      await Promise.race([enqueuePatch(body), sleep(timeoutMs)]);
    },
    [attemptId, buildBody, enqueuePatch],
  );

  return {
    status,
    lastSavedAt,
    retryNow,
    waitForFlush,
  };
}
