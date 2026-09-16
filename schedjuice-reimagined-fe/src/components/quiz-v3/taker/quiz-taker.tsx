"use client";
import { Button, Skeleton, useToast } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import { isQuizV3TiptapDocEmpty } from "@/helpers/quiz-v3-tiptap-empty";
import {
  parseQuizV3TakeStudentMessage,
  quizTakeQueryRetryPredicate,
} from "@/helpers/quiz-v3-api-error";
import { axiosClient } from "@/lib/api";
import {
  QuizTakeSavedAnswers,
  QuestionType,
  type QuestionTypeV3,
  type QuizTakeProgressHydration,
} from "@/types/quiz-v3";
import type { AxiosResponse } from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Bookmark, InputField as Keyboard } from "iconoir-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuizTakeFetchError } from "@/components/quiz-v3/shared/quiz-take-fetch-error";
import {
  answersFromMirrorToPlayer,
  clearMirror,
  markedReviewFromMirror,
  readMirror,
  shouldRestoreFromMirror,
} from "./quiz-autosave-mirror";
import { QuizAutosaveStatus } from "./quiz-autosave-status";
import { QuizQuestionPlayerLayout } from "./quiz-question-player-layout";
import { QuizShortcutsDialog } from "./quiz-shortcuts-dialog";
import { QuizTimer } from "./quiz-timer";
import { PreSubmitReviewDialog } from "./pre-submit-review-dialog";
import { SubmitConfirmation } from "./submit-confirmation";
import {
  hydrateAnswerForQuestion,
  buildAnswersPayload,
} from "./quiz-taker-progress-payload";
import { useQuizAutosave } from "./use-quiz-autosave";
import {
  useQuizQuestionPlayerAnswers,
  type QuizQuestionPlayerAnswerValue,
} from "./use-quiz-question-player-answers";
import { useQuizTakerShortcuts } from "./use-quiz-taker-shortcuts";

const MAX_CONSECUTIVE_SUBMIT_FAILURES = 3;

type TakePayload = {
  id: number;
  title: string;
  allowed_minutes: number;
  questions: QuestionTypeV3[];
  attempt_id: number;
  started_at: string;
  can_show_answers_afterwards: boolean;
  can_navigate_questions: boolean;
} & QuizTakeProgressHydration;

const postSubmitStorageKey = (code: string) => `quiz-v3-postsubmit-${code}`;

export function QuizTaker({ code }: { code: string }) {
  const toast = useToast();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [maxReachableIndex, setMaxReachableIndex] = useState(0);
  const [markedReview, setMarkedReview] = useState<Record<number, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [submitFailures, setSubmitFailures] = useState(0);
  const [allowAutosave, setAllowAutosave] = useState(false);
  const [isFinishingSave, setIsFinishingSave] = useState(false);

  const hydratedAttemptIdRef = useRef<number | null>(null);
  /** Latest attempt id — for clearing mirror after submit regardless of stale closures. */
  const attemptMirrorClearRef = useRef<number | undefined>(undefined);

  const [autoSubmitAfterTimer, setAutoSubmitAfterTimer] = useState(false);

  const query = useQuery({
    queryKey: ["quiz-v3-take", code],
    queryFn: async () => {
      const res = await axiosClient.get(`quizzes/take/${code}`);
      return res.data?.data as TakePayload;
    },
    retry: quizTakeQueryRetryPredicate,
  });

  const questions = query.data?.questions ?? [];
  const {
    answers,
    answered,
    setAnswers,
    setChoiceForCurrent,
    setFillForCurrent,
    setTrueFalseForCurrent,
    setOpenTextForCurrent,
  } = useQuizQuestionPlayerAnswers(questions);

  useEffect(() => {
    hydratedAttemptIdRef.current = null;
    setAllowAutosave(false);
    attemptMirrorClearRef.current = undefined;
    setIndex(0);
    setMaxReachableIndex(0);
    setMarkedReview({});
    setAnswers({});
    setConfirmOpen(false);
    setReviewOpen(false);
    setShortcutsOpen(false);
    setIsFinishingSave(false);
    setAutoSubmitAfterTimer(false);
  }, [code, setAnswers]);

  /** One-time hydrate answers + marks per attempt load. */
  useEffect(() => {
    const d = query.data;
    if (!d?.questions?.length || d.attempt_id == null) return;
    if (hydratedAttemptIdRef.current === d.attempt_id) return;
    hydratedAttemptIdRef.current = d.attempt_id;

    const sa = d.saved_answers ?? ({} as QuizTakeSavedAnswers);
    const sm = d.saved_marked_review ?? {};
    const ans: Record<number, QuizQuestionPlayerAnswerValue> = {};
    for (const q of d.questions) {
      if (!q.id) continue;
      const h = hydrateAnswerForQuestion(q, sa[String(q.id)]);
      if (h !== undefined) ans[q.id] = h;
    }

    const mr: Record<number, boolean> = {};
    for (const q of d.questions) {
      if (q.id != null) mr[q.id] = Boolean(sm[String(q.id)]);
    }

    let nextAns: Record<number, QuizQuestionPlayerAnswerValue> = { ...ans };
    let nextMr: Record<number, boolean> = { ...mr };

    const mirror =
      typeof window !== "undefined"
        ? readMirror(sessionStorage, code, d.attempt_id)
        : null;

    if (mirror && shouldRestoreFromMirror(mirror, d.attempt_id)) {
      nextAns = { ...nextAns, ...answersFromMirrorToPlayer(d.questions, mirror) };
      nextMr = { ...nextMr, ...markedReviewFromMirror(mirror) };
      toast.add({
        description: "Restored unsaved answers from this device."});
    } else if (mirror) {
      clearMirror(sessionStorage, code, d.attempt_id);
    }

    attemptMirrorClearRef.current = d.attempt_id;

    setAnswers(nextAns);
    setMarkedReview(nextMr);

    setAllowAutosave(false);
    const u = window.setTimeout(() => {
      setAllowAutosave(true);
    }, 150);
    return () => window.clearTimeout(u);
  }, [code, query.data, setAnswers, toast]);

  const markedReviewByIndex = useMemo(
    () =>
      questions.map((q) => (q.id != null ? Boolean(markedReview[q.id]) : false)),
    [questions, markedReview],
  );

  const attemptId = query.data?.attempt_id ?? null;

  useEffect(() => {
    if (attemptId != null) {
      attemptMirrorClearRef.current = attemptId;
      setSubmitFailures(0);
    }
  }, [attemptId]);

  const submit = useMutation({
    retry: false,
    mutationFn: async () => {
      const d = query.data;
      if (!d) throw new Error("No quiz");
      const body = buildAnswersPayload(d.questions, answers);
      return makePostRequest(`quizzes/take/${code}/submit`, {
        attempt_id: d.attempt_id,
        answers: body,
      });
    },
    onSuccess: (
      res: AxiosResponse<{
        data?: {
          id?: number;
          score?: string;
          max_score?: number;
          outro_body?: unknown;
          quiz_theme?: string;
          logo_url?: string | null;
          course_id?: number | null;
        };
      }>,
    ) => {
      setSubmitFailures(0);
      toast.add({ description: "Quiz submitted." });
      setConfirmOpen(false);
      const aid = attemptMirrorClearRef.current;
      if (typeof window !== "undefined" && aid != null) {
        clearMirror(sessionStorage, code, aid);
      }
      const payload = res?.data?.data;
      const submittedId = payload?.id;
      if (submittedId == null) return;
      const outro = payload?.outro_body;
      if (outro != null && !isQuizV3TiptapDocEmpty(outro)) {
        try {
          sessionStorage.setItem(
            postSubmitStorageKey(code),
            JSON.stringify({
              attemptId: submittedId,
              outro_body: outro,
              quiz_theme: payload?.quiz_theme,
              logo_url: payload?.logo_url ?? null,
              course_id:
                typeof payload?.course_id === "number" &&
                Number.isFinite(payload.course_id)
                  ? payload.course_id
                  : null,
            }),
          );
        } catch {
          router.push(`/take/${code}/attempt/${submittedId}`);
          return;
        }
        router.push(`/take/${code}/done`);
        return;
      }
      router.push(`/take/${code}/attempt/${submittedId}`);
    },
    onError: (err: unknown) => {
      const msg = parseQuizV3TakeStudentMessage(err, "Submit failed. Try again.");
      setSubmitFailures((prev) => {
        const next = prev + 1;
        const blocked = next >= MAX_CONSECUTIVE_SUBMIT_FAILURES;
        toast.add({
          title: blocked ? "Too many failed submits" : "Could not submit",
          description: blocked
            ? `After ${MAX_CONSECUTIVE_SUBMIT_FAILURES} failed attempts, please refresh the page before trying again. Last error: ${msg}`
            : msg,
        });
        return next;
      });
    },
  });

  const autosave = useQuizAutosave({
    code,
    attemptId,
    questions,
    answers,
    markedReview,
    allowAutosave,
    submitIsPending: submit.isPending,
  });

  useEffect(() => {
    if (submit.isPending) setIsFinishingSave(false);
  }, [submit.isPending]);

  const handleConfirmSubmit = useCallback(async () => {
    setIsFinishingSave(true);
    await autosave.waitForFlush(2000);
    submit.mutate();
  }, [autosave, submit]);

  const submitBlocked = submitFailures >= MAX_CONSECUTIVE_SUBMIT_FAILURES;
  const submitBlockedRef = useRef(submitBlocked);
  submitBlockedRef.current = submitBlocked;

  const submitMutateRef = useRef(submit.mutate);
  submitMutateRef.current = submit.mutate;

  const onExpire = useCallback(() => {
    if (submitBlockedRef.current) return;
    setAutoSubmitAfterTimer(true);
    submitMutateRef.current();
  }, []);

  const current = questions[index];
  const canNavigateQuestions = query.data?.can_navigate_questions ?? false;

  const unansweredCount = answered.filter((a) => !a).length;

  const goToIndex = useCallback(
    (i: number) => {
      const hi = Math.max(questions.length - 1, 0);
      const next = Math.min(Math.max(0, i), hi);
      if (!canNavigateQuestions && next > maxReachableIndex) return;
      setIndex(next);
      setMaxReachableIndex((m) => Math.max(m, next));
    },
    [canNavigateQuestions, maxReachableIndex, questions.length],
  );

  const goNextSequential = useCallback(() => {
    if (index >= questions.length - 1) return;
    const n = index + 1;
    setIndex(n);
    setMaxReachableIndex((m) => Math.max(m, n));
  }, [index, questions.length]);

  const toggleMarkCurrent = useCallback(() => {
    const id = questions[index]?.id;
    if (id == null) return;
    setMarkedReview((prev) => ({ ...prev, [id]: !Boolean(prev[id]) }));
  }, [questions, index]);

  const goPrev = useCallback(() => goToIndex(index - 1), [goToIndex, index]);

  const goNextShortcut = useCallback(() => {
    if (index >= questions.length - 1) return;
    goNextSequential();
  }, [goNextSequential, index, questions.length]);

  useQuizTakerShortcuts({
    enabled:
      !query.isLoading &&
      !(query.isError || !query.data) &&
      !submit.isPending &&
      questions.length > 0,
    goNext: goNextShortcut,
    goPrev,
    toggleFlagCurrent: toggleMarkCurrent,
    openReviewDialog: () => setReviewOpen(true),
    openHelpDialog: () => setShortcutsOpen(true),
  });

  const isSubmitting = submit.isPending;

  if (query.isLoading) {
    return (
      <div
        className="space-y-4"
        aria-busy
        aria-label="Loading quiz"
      >
        <div className="flex flex-col gap-2 md:flex-row md:justify-between">
          <Skeleton className="h-[4.75rem] w-full rounded-md md:max-w-xs" />
          <Skeleton className="h-5 w-full max-w-[12rem]" />
        </div>
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)]">
          <Skeleton className="hidden h-64 rounded-md md:block" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <QuizTakeFetchError
        error={query.error}
        fallback="This quiz is not available or the link is invalid."
      />
    );
  }
  if (!query.data) {
    return (
      <QuizTakeFetchError fallback="This quiz is not available or the link is invalid." />
    );
  }

  const fillMap =
    current?.id &&
    current.question_type === QuestionType.FillInBlank &&
    answers[current.id] &&
    typeof answers[current.id] === "object" &&
    !Array.isArray(answers[current.id])
      ? (answers[current.id] as Record<string, string>)
      : {};

  const rawCurrentAnswer =
    current?.id != null ? answers[current.id] : undefined;

  let trueFalseChoice: boolean | undefined;
  if (
    current?.question_type === QuestionType.TrueFalse &&
    rawCurrentAnswer &&
    typeof rawCurrentAnswer === "object" &&
    !Array.isArray(rawCurrentAnswer)
  ) {
    const v = (rawCurrentAnswer as { value?: unknown }).value;
    if (typeof v === "boolean") trueFalseChoice = v;
  }

  let shortOrEssayText = "";
  if (
    current &&
    (current.question_type === QuestionType.ShortAnswer ||
      current.question_type === QuestionType.Essay) &&
    rawCurrentAnswer &&
    typeof rawCurrentAnswer === "object" &&
    !Array.isArray(rawCurrentAnswer) &&
    typeof (rawCurrentAnswer as { text?: unknown }).text === "string"
  ) {
    shortOrEssayText = (rawCurrentAnswer as { text: string }).text;
  }

  const atLastQuestion = index >= questions.length - 1;
  const flagged = Boolean(current?.id && markedReview[current.id]);

  return (
    <div className="space-y-4">
      <div className="sr-only" aria-live="polite" aria-atomic>
        {autoSubmitAfterTimer && submit.isPending
          ? "Time is up. Submitting your quiz."
          : ""}
      </div>
      {autoSubmitAfterTimer && submit.isPending ? (
        <div
          role="status"
          className="rounded-md border border-border bg-surface-sunken/40 px-3 py-2 text-sm text-text-primary"
          aria-busy
        >
          Time is up — submitting your answers…
        </div>
      ) : null}
      <div
        className="max-md:sticky max-md:top-0 max-md:z-10 max-md:border-border max-md:border-b max-md:bg-surface/95 max-md:pb-2 max-md:backdrop-blur"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <QuizTimer
            startedAt={query.data.started_at}
            allowedMinutes={query.data.allowed_minutes}
            onExpire={onExpire}
            className="w-full sm:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <QuizAutosaveStatus
              status={autosave.status}
              lastSavedAt={autosave.lastSavedAt}
              onRetry={autosave.retryNow}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-text-muted min-h-11 gap-1.5"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="size-4 shrink-0" aria-hidden />
              Keyboard
            </Button>
          </div>
        </div>
      </div>

      <QuizQuestionPlayerLayout
        questions={questions}
        currentIndex={index}
        answered={answered}
        markedForReview={markedReviewByIndex}
        onGoToIndex={goToIndex}
        canNavigateQuestions={canNavigateQuestions}
        maxReachableIndex={maxReachableIndex}
        onChoiceChange={(ids) => {
          if (!isSubmitting) setChoiceForCurrent(current, ids);
        }}
        onFillAnswerChange={(u, t) => {
          if (!isSubmitting) setFillForCurrent(current, u, t);
        }}
        selectedIds={
          current?.id
            ? Array.isArray(answers[current.id])
              ? (answers[current.id] as number[])
              : []
            : []
        }
        fillAnswers={fillMap}
        trueFalseChoice={trueFalseChoice}
        onTrueFalseChoice={(v) => {
          if (!isSubmitting) setTrueFalseForCurrent(current, v);
        }}
        shortOrEssayText={shortOrEssayText}
        onShortOrEssayChange={(t) => {
          if (!isSubmitting) setOpenTextForCurrent(current, t);
        }}
        atLastQuestion={atLastQuestion}
        cardToolbar={
          current?.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 shrink-0 size-8 p-0"
              aria-pressed={flagged}
              aria-label={
                flagged ? "Marked for review" : "Mark for review"
              }
              disabled={isSubmitting}
              onClick={toggleMarkCurrent}
            >
              <Bookmark
                className={`size-5 ${flagged ? "fill-amber-500 text-amber-600" : ""}`}
                aria-hidden
              />
            </Button>
          ) : null
        }
        footerClassName="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:border-border max-md:border-t max-md:bg-surface/95 max-md:pt-2 max-md:backdrop-blur max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        nextTrailing={
          <Button
            type="button"
            className="min-h-11 touch-manipulation"
            disabled={isSubmitting}
            onClick={goNextSequential}
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        }
        lastTrailing={
          <Button
            type="button"
            className="min-h-11 touch-manipulation"
            disabled={submitBlocked || isSubmitting}
            title={
              submitBlocked
                ? "Refresh the page to try submitting again."
                : undefined
            }
            onClick={() => setReviewOpen(true)}
          >
            Finish
          </Button>
        }
      />

      <PreSubmitReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        questions={questions}
        answered={answered}
        markedReviewByIndex={markedReviewByIndex}
        onGoToIndex={(i) => {
          goToIndex(i);
        }}
        onRequestSubmitConfirmation={() => setConfirmOpen(true)}
      />
      <QuizShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <SubmitConfirmation
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        unansweredCount={unansweredCount}
        onConfirm={handleConfirmSubmit}
        isLoading={submit.isPending}
        isFinishingSave={isFinishingSave}
        autosaveStatus={autosave.status}
        confirmDisabled={submitBlocked}
        confirmBlockedHint={
          submitBlocked
            ? `Submit was tried ${MAX_CONSECUTIVE_SUBMIT_FAILURES} times without success. Refresh the page to try again.`
            : undefined
        }
      />
    </div>
  );
}
