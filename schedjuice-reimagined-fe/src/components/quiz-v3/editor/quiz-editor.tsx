"use client";
import { Button, useToast } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import { cn } from "@/lib/utils";
import { useQuizV3EditorStore } from "@/store/quiz-v3";
import {
  QuestionType,
  type QuestionTypeV3,
  type QuizTypeV3,
} from "@/types/quiz-v3";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavArrowRight as ChevronRight } from "iconoir-react";
import { relationFkToPkNullable } from "@/helpers/relation-fk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type EditorSyncValidationError,
  formatKeyedErrorsForBanner,
  parseEditorSyncValidationError,
  quizFieldLabel,
} from "@/helpers/quiz-editor-sync-error";
import { QuestionTypeMenu } from "./add-question-button";
import {
  areEditorSyncQuestionsValid,
  validateEditorSyncQuestions,
} from "./quiz-editor-questions-sync-valid";
import { buildEditorSyncQuestionPayload } from "./quiz-editor-sync-payload";
import { QuestionEditor, QuizEditorQuestionsAutosaveBanner } from "./question-editor";
import { QuestionListSidebar } from "./question-list-sidebar";

const REORDER_AUTOSAVE_DEBOUNCE_MS = 800;
const QUESTIONS_AUTOSAVE_DEBOUNCE_MS = 2600;

/**
 * Volatile fields the payload builder regenerates on every call (e.g. timestamps
 * default to `new Date().toISOString()` for fill-in-blank slots without a stored
 * config_at). Strip them before signing so two builds of the same content match.
 */
const VOLATILE_PAYLOAD_KEYS = new Set([
  "typed_updated_at",
  "single_choice_updated_at",
]);

/**
 * Stable signature of question payloads used to detect whether the user edited
 * questions while an autosave / reorder save was in flight. Returning the same
 * string for the same content (including `display_order`, options, slots, etc.)
 * is the contract callers rely on.
 */
function questionsRequestSignature(
  payloads: Record<string, unknown>[],
): string {
  return JSON.stringify(payloads, (key, value) =>
    VOLATILE_PAYLOAD_KEYS.has(key) ? undefined : value,
  );
}

type Props = {
  quizId: number;
  initialQuiz: QuizTypeV3;
  initialQuestions: import("@/types/quiz-v3").QuestionTypeV3[];
};

export function QuizEditor({ quizId, initialQuiz, initialQuestions }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const [activeIndex, setActiveIndex] = useState(0);
  const [questionsSidebarOpen, setQuestionsSidebarOpen] = useState(true);
  const [isSavingQuestionOrder, setIsSavingQuestionOrder] = useState(false);
  const [pendingQuizImages, setPendingQuizImages] = useState(0);
  const bumpQuizImagePending = useCallback((delta: number) => {
    setPendingQuizImages((n) => Math.max(0, n + delta));
  }, []);
  const setFromApi = useQuizV3EditorStore((s) => s.setFromApi);
  const quiz = useQuizV3EditorStore((s) => s.quiz);
  const questions = useQuizV3EditorStore((s) => s.questions);
  const isDirty = useQuizV3EditorStore((s) => s.isDirty);
  const isMetaDirty = useQuizV3EditorStore((s) => s.isMetaDirty);
  const updateQuestion = useQuizV3EditorStore((s) => s.updateQuestion);
  const addQuestion = useQuizV3EditorStore((s) => s.addQuestion);
  const setQuestionType = useQuizV3EditorStore((s) => s.setQuestionType);
  const removeQuestion = useQuizV3EditorStore((s) => s.removeQuestion);
  const reorderQuestions = useQuizV3EditorStore((s) => s.reorderQuestions);
  const addOption = useQuizV3EditorStore((s) => s.addOption);
  const updateOption = useQuizV3EditorStore((s) => s.updateOption);
  const removeOption = useQuizV3EditorStore((s) => s.removeOption);
  const setCorrectSingle = useQuizV3EditorStore((s) => s.setCorrectSingle);
  const toggleCorrectMulti = useQuizV3EditorStore((s) => s.toggleCorrectMulti);
  const togglePartialScoring = useQuizV3EditorStore((s) => s.togglePartialScoring);
  const updateFillSlotPoints = useQuizV3EditorStore((s) => s.updateFillSlotPoints);
  const updateFillAcceptableAnswer = useQuizV3EditorStore(
    (s) => s.updateFillAcceptableAnswer,
  );
  const removeFillAcceptableAnswer = useQuizV3EditorStore(
    (s) => s.removeFillAcceptableAnswer,
  );
  const addFillAcceptableAnswer = useQuizV3EditorStore(
    (s) => s.addFillAcceptableAnswer,
  );
  const setFillBlankAnswerMode = useQuizV3EditorStore(
    (s) => s.setFillBlankAnswerMode,
  );
  const updateFillChoiceOption = useQuizV3EditorStore(
    (s) => s.updateFillChoiceOption,
  );
  const addFillChoiceOption = useQuizV3EditorStore((s) => s.addFillChoiceOption);
  const removeFillChoiceOption = useQuizV3EditorStore(
    (s) => s.removeFillChoiceOption,
  );
  const setFillChoiceCorrect = useQuizV3EditorStore(
    (s) => s.setFillChoiceCorrect,
  );
  const setDirty = useQuizV3EditorStore((s) => s.setDirty);
  const clearMetaDirty = useQuizV3EditorStore((s) => s.clearMetaDirty);
  const applyQuestionsSyncFromServer = useQuizV3EditorStore(
    (s) => s.applyQuestionsSyncFromServer,
  );
  const applyServerSaveKeepingLocalTail = useQuizV3EditorStore(
    (s) => s.applyServerSaveKeepingLocalTail,
  );

  const [questionsAutosaveBanner, setQuestionsAutosaveBanner] = useState(
    QuizEditorQuestionsAutosaveBanner.Hidden,
  );

  const [syncValidationError, setSyncValidationError] =
    useState<EditorSyncValidationError | null>(null);

  const reorderSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reorderSaveGenerationRef = useRef(0);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    return () => {
      if (reorderSaveTimeoutRef.current) {
        clearTimeout(reorderSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeIndex >= questions.length && questions.length > 0) {
      setActiveIndex(questions.length - 1);
    }
    if (questions.length === 0) setActiveIndex(0);
  }, [questions.length, activeIndex]);

  const handleEditorSyncError = useCallback(
    (
      err: unknown,
      context: "manual" | "autosave",
      options?: { skipQuestionRedirect?: boolean },
    ) => {
      const parsed = parseEditorSyncValidationError(err);
      if (!parsed) {
        toast.add({
          description:
            context === "autosave"
              ? "Could not autosave questions. Try Save."
              : "Could not save. Try again."});
        return;
      }
      if (parsed.kind === "generic") {
        toast.add({
          description: parsed.summary});
        return;
      }
      setSyncValidationError(parsed);
      if (
        parsed.kind === "question" &&
        !options?.skipQuestionRedirect
      ) {
        const n = parsed.questionIndex;
        const len = useQuizV3EditorStore.getState().questions.length;
        if (n >= 0 && n < len) {
          setActiveIndex(n);
        }
      }
      if (parsed.kind === "question" && options?.skipQuestionRedirect) {
        toast.add({
          description: "Could not save. Check the red dot in the question list."});
      }
    },
    [toast],
  );

  const quizSyncBannerLines =
    syncValidationError?.kind === "quiz"
      ? formatKeyedErrorsForBanner(syncValidationError.details, quizFieldLabel)
      : undefined;

  const clearQuestionSyncErrorsForActiveQuestion = useCallback(() => {
    setSyncValidationError((prev) => {
      if (!prev || prev.kind !== "question") return prev;
      if (prev.questionIndex !== activeIndex) return prev;
      return null;
    });
  }, [activeIndex]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { quiz: qz, questions: snapshot } = useQuizV3EditorStore.getState();
      if (!qz?.id) throw new Error("No quiz");
      const quizPatch = {
        title: qz.title,
        status: qz.status,
        can_show_answers_afterwards: qz.can_show_answers_afterwards,
        can_navigate_questions: qz.can_navigate_questions ?? false,
        max_retakes: qz.max_retakes,
        allowed_minutes: qz.allowed_minutes,
        activation_date: qz.activation_date ?? null,
        expiry_date: qz.expiry_date ?? null,
        category: relationFkToPkNullable(qz.category),
        course: relationFkToPkNullable(qz.course),
        intro_body: qz.intro_body ?? { type: "doc", content: [] },
        outro_body: qz.outro_body ?? { type: "doc", content: [] },
        quiz_theme: qz.quiz_theme,
      };
      const questionsPayload = snapshot.map((q, i) =>
        buildEditorSyncQuestionPayload(quizId, q, i),
      );
      const res = await makePostRequest(`quizzes/${quizId}/editor-sync`, {
        quiz: quizPatch,
        questions: questionsPayload,
      });
      const bundle = res.data?.data as
        | { quiz?: QuizTypeV3; questions?: QuestionTypeV3[] }
        | undefined;
      if (bundle?.quiz && Array.isArray(bundle.questions)) {
        setFromApi(bundle.quiz, bundle.questions);
      }
    },
    onMutate: () => {
      setSyncValidationError(null);
    },
    onSuccess: () => {
      setSyncValidationError(null);
      toast.add({ description: "Quiz saved." });
      setDirty(false);
      clearMetaDirty();
      setQuestionsAutosaveBanner(QuizEditorQuestionsAutosaveBanner.Hidden);
      qc.invalidateQueries({ queryKey: ["quiz-v3", quizId] });
    },
    onError: (err: unknown) => {
      handleEditorSyncError(err, "manual", { skipQuestionRedirect: true });
    },
  });

  const saveAndAddNextMutation = useMutation({
    mutationFn: async (vars: {
      quizPatch: Record<string, unknown>;
      questionsPayload: Record<string, unknown>[];
    }) => {
      const res = await makePostRequest(`quizzes/${quizId}/editor-sync`, {
        quiz: vars.quizPatch,
        questions: vars.questionsPayload,
      });
      const bundle = res.data?.data as
        | { quiz?: QuizTypeV3; questions?: QuestionTypeV3[] }
        | undefined;
      if (bundle?.quiz && Array.isArray(bundle.questions)) {
        applyServerSaveKeepingLocalTail(bundle.quiz, bundle.questions);
      }
    },
    onMutate: () => {
      setSyncValidationError(null);
    },
    onSuccess: () => {
      setSyncValidationError(null);
      toast.add({ description: "Quiz saved." });
      setQuestionsAutosaveBanner(QuizEditorQuestionsAutosaveBanner.Hidden);
      qc.invalidateQueries({ queryKey: ["quiz-v3", quizId] });
    },
    onError: (err: unknown) => {
      handleEditorSyncError(err, "manual", { skipQuestionRedirect: true });
    },
  });

  const reorderSync = useMutation({
    mutationFn: async (vars: {
      questionsPayload: Record<string, unknown>[];
      requestSignature: string;
    }) => {
      const res = await makePostRequest(`quizzes/${quizId}/editor-sync`, {
        questions: vars.questionsPayload,
      });
      const bundle = res.data?.data as
        | { quiz?: QuizTypeV3; questions?: QuestionTypeV3[] }
        | undefined;
      if (!bundle?.quiz || !Array.isArray(bundle.questions)) {
        throw new Error("Invalid editor-sync response");
      }
      return { bundle, requestSignature: vars.requestSignature };
    },
    onMutate: () => {
      setSyncValidationError(null);
    },
    onSuccess: (data) => {
      const latest = useQuizV3EditorStore.getState().questions;
      const currentSignature = questionsRequestSignature(
        latest.map((q, i) => buildEditorSyncQuestionPayload(quizId, q, i)),
      );
      if (currentSignature !== data.requestSignature) {
        // User edited (typed/reordered) while reorder save was in flight.
        // Skip applying the older server snapshot so we don't overwrite the
        // active editor; the next autosave will reconcile.
        return;
      }
      const nextQuestions = data.bundle.questions;
      if (!Array.isArray(nextQuestions)) return;
      applyQuestionsSyncFromServer(nextQuestions, data.bundle.quiz);
      setSyncValidationError(null);
      qc.invalidateQueries({ queryKey: ["quiz-v3", quizId] });
    },
    onError: (err: unknown) => {
      handleEditorSyncError(err, "manual", { skipQuestionRedirect: true });
    },
  });

  const questionsOnlySync = useMutation({
    mutationFn: async () => {
      const { quiz: qz, questions: snapshot } = useQuizV3EditorStore.getState();
      if (!qz?.id) throw new Error("No quiz");
      const questionsPayload = snapshot.map((q, i) =>
        buildEditorSyncQuestionPayload(quizId, q, i),
      );
      const requestSignature = questionsRequestSignature(questionsPayload);
      const res = await makePostRequest(`quizzes/${quizId}/editor-sync`, {
        questions: questionsPayload,
      });
      const bundle = res.data?.data as
        | { quiz?: QuizTypeV3; questions?: QuestionTypeV3[] }
        | undefined;
      if (!bundle?.quiz || !Array.isArray(bundle.questions)) {
        throw new Error("Invalid editor-sync response");
      }
      return { bundle, requestSignature };
    },
    onMutate: () => {
      setQuestionsAutosaveBanner(QuizEditorQuestionsAutosaveBanner.Saving);
      setSyncValidationError(null);
    },
    onSuccess: (data) => {
      const latest = useQuizV3EditorStore.getState().questions;
      const currentSignature = questionsRequestSignature(
        latest.map((q, i) => buildEditorSyncQuestionPayload(quizId, q, i)),
      );
      if (currentSignature !== data.requestSignature) {
        // The user kept editing while autosave was in flight. Do NOT apply the
        // older server snapshot — that would overwrite the active editor and
        // (when a new question first gets a server id) remount the rich-text
        // field, wiping the in-progress keystrokes. The next debounced autosave
        // will reconcile with the latest local state.
        setQuestionsAutosaveBanner(QuizEditorQuestionsAutosaveBanner.Hidden);
        return;
      }
      applyQuestionsSyncFromServer(data.bundle.questions!, data.bundle.quiz);
      setSyncValidationError(null);
      setQuestionsAutosaveBanner(QuizEditorQuestionsAutosaveBanner.Saved);
      qc.invalidateQueries({ queryKey: ["quiz-v3", quizId] });
    },
    onError: (err: unknown) => {
      setQuestionsAutosaveBanner(QuizEditorQuestionsAutosaveBanner.Hidden);
      handleEditorSyncError(err, "autosave");
    },
  });

  useEffect(() => {
    if (!isDirty) return;
    setQuestionsAutosaveBanner((b) =>
      b === QuizEditorQuestionsAutosaveBanner.Saving
        ? b
        : QuizEditorQuestionsAutosaveBanner.Hidden,
    );
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    if (pendingQuizImages > 0) return;
    if (saveMutation.isPending) return;
    if (saveAndAddNextMutation.isPending) return;
    if (isSavingQuestionOrder) return;
    if (questionsOnlySync.isPending) return;
    if (reorderSync.isPending) return;

    const id = setTimeout(() => {
      const snap = useQuizV3EditorStore.getState().questions;
      const payloads = snap.map((q, i) =>
        buildEditorSyncQuestionPayload(quizId, q, i),
      );
      if (!areEditorSyncQuestionsValid(payloads)) return;
      questionsOnlySync.mutate();
    }, QUESTIONS_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [
    isDirty,
    questions,
    quizId,
    pendingQuizImages,
    saveMutation.isPending,
    saveAndAddNextMutation.isPending,
    isSavingQuestionOrder,
    questionsOnlySync.isPending,
    reorderSync.isPending,
    questionsOnlySync.mutate,
  ]);

  const scheduleAutoSaveAfterReorder = useCallback(() => {
    if (reorderSaveTimeoutRef.current) {
      clearTimeout(reorderSaveTimeoutRef.current);
    }
    reorderSaveTimeoutRef.current = setTimeout(() => {
      reorderSaveTimeoutRef.current = null;
      const gen = ++reorderSaveGenerationRef.current;
      const snapshot = useQuizV3EditorStore.getState().questions;
      const payloads = snapshot.map((q, i) =>
        buildEditorSyncQuestionPayload(quizId, q, i),
      );
      if (!areEditorSyncQuestionsValid(payloads)) {
        return;
      }
      const requestSignature = questionsRequestSignature(payloads);
      setIsSavingQuestionOrder(true);
      reorderSync.mutate(
        { questionsPayload: payloads, requestSignature },
        {
          onSettled: () => {
            if (reorderSaveGenerationRef.current === gen) {
              setIsSavingQuestionOrder(false);
            }
          },
        },
      );
    }, REORDER_AUTOSAVE_DEBOUNCE_MS);
  }, [quizId, reorderSync]);

  const reorderSidebar = useCallback(
    (next: QuestionTypeV3[]) => {
      const payloads = next.map((q, i) =>
        buildEditorSyncQuestionPayload(quizId, q, i),
      );
      if (!areEditorSyncQuestionsValid(payloads)) return;
      const ai = activeIndexRef.current;
      const latest = useQuizV3EditorStore.getState().questions;
      const cur = latest[ai];
      const curKey = cur ? (cur.id ?? cur.client_id) : undefined;
      reorderQuestions(next);
      if (curKey != null) {
        const ni = next.findIndex((q) => (q.id ?? q.client_id) === curKey);
        if (ni >= 0) setActiveIndex(ni);
      }
      scheduleAutoSaveAfterReorder();
    },
    [quizId, reorderQuestions, scheduleAutoSaveAfterReorder],
  );

  const handleSave = useCallback(() => {
    const { quiz: qz, questions: snapshot } = useQuizV3EditorStore.getState();
    if (!qz?.id) return;
    const questionsPayload = snapshot.map((q, i) =>
      buildEditorSyncQuestionPayload(quizId, q, i),
    );
    const issues = validateEditorSyncQuestions(questionsPayload);
    if (issues.length > 0) {
      const first = issues[0]!;
      setSyncValidationError({
        kind: "question",
        questionIndex: first.questionIndex,
        details: first.details,
      });
      setActiveIndex(first.questionIndex);
      return;
    }
    saveMutation.mutate();
  }, [quizId, saveMutation]);

  const handleSaveAndAddNext = useCallback(() => {
    const { quiz: qz, questions: snapshot } = useQuizV3EditorStore.getState();
    if (!qz?.id) return;
    const questionsPayload = snapshot.map((q, i) =>
      buildEditorSyncQuestionPayload(quizId, q, i),
    );
    const issues = validateEditorSyncQuestions(questionsPayload);
    if (issues.length > 0) {
      const first = issues[0]!;
      setSyncValidationError({
        kind: "question",
        questionIndex: first.questionIndex,
        details: first.details,
      });
      setActiveIndex(first.questionIndex);
      return;
    }
    const quizPatch = {
      title: qz.title,
      status: qz.status,
      can_show_answers_afterwards: qz.can_show_answers_afterwards,
      can_navigate_questions: qz.can_navigate_questions ?? false,
      max_retakes: qz.max_retakes,
      allowed_minutes: qz.allowed_minutes,
      activation_date: qz.activation_date ?? null,
      expiry_date: qz.expiry_date ?? null,
      category: relationFkToPkNullable(qz.category),
      course: relationFkToPkNullable(qz.course),
      intro_body: qz.intro_body ?? { type: "doc", content: [] },
      outro_body: qz.outro_body ?? { type: "doc", content: [] },
      quiz_theme: qz.quiz_theme,
    };
    addQuestion(QuestionType.SingleChoice);
    const len = useQuizV3EditorStore.getState().questions.length;
    setActiveIndex(Math.max(0, len - 1));
    saveAndAddNextMutation.mutate({ quizPatch, questionsPayload });
  }, [addQuestion, quizId, saveAndAddNextMutation]);

  const canReorder = useMemo(() => {
    const payloads = questions.map((q, i) =>
      buildEditorSyncQuestionPayload(quizId, q, i),
    );
    return areEditorSyncQuestionsValid(payloads);
  }, [questions, quizId]);

  const questionErrorIndexes = useMemo(() => {
    if (syncValidationError?.kind === "question") {
      return new Set<number>([syncValidationError.questionIndex]);
    }
    return undefined;
  }, [syncValidationError]);

  if (!quiz) return null;

  const q = questions[activeIndex];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside
        className={cn(
          "shrink-0 overflow-hidden transition-[width,max-width] duration-300 ease-in-out motion-reduce:transition-none",
          questionsSidebarOpen
            ? "w-full max-w-full lg:w-[260px] lg:min-w-[260px] lg:max-w-[260px]"
            : "w-11 min-w-11 max-w-11",
        )}
      >
        {questionsSidebarOpen ? (
          <div
            key="sidebar-open"
            className="min-w-0 w-full animate-in fade-in slide-in-from-left-2 duration-200 ease-out motion-reduce:animate-none"
          >
            <QuestionListSidebar
              questions={questions}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
              onReorderList={reorderSidebar}
              onCollapse={() => setQuestionsSidebarOpen(false)}
              isSavingOrder={isSavingQuestionOrder}
              errorIndexes={questionErrorIndexes}
              canReorder={canReorder}
            />
          </div>
        ) : (
          <div
            key="sidebar-collapsed"
            className="flex animate-in fade-in zoom-in-95 justify-start pt-0.5 duration-200 ease-out motion-reduce:animate-none"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="size-9 shrink-0 cursor-pointer p-0"
              onClick={() => setQuestionsSidebarOpen(true)}
              aria-label="Expand question list"
              aria-expanded={false}
              title="Show questions"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </aside>
      <div className="min-w-0 flex-1 space-y-4">
        {quizSyncBannerLines && quizSyncBannerLines.length > 0 ? (
          <div
            className="rounded-md border border-destructive/40 bg-danger/5 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            <p className="font-medium text-danger">
              Fix quiz settings, then save again
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {quizSyncBannerLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {questions.length > 0 && (
          <div className="flex w-full min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <QuestionTypeMenu
                value={q?.question_type ?? QuestionType.SingleChoice}
                onChange={(t) => {
                  if (q) setQuestionType(activeIndex, t);
                }}
                disabled={!q}
              />
            </div>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="shrink-0 cursor-pointer"
              onClick={() => {
                removeQuestion(activeIndex);
              }}
            >
              Remove question
            </Button>
          </div>
        )}

        {q && (
          <QuestionEditor
            quizId={quizId}
            onQuizImagePendingDelta={bumpQuizImagePending}
            question={q}
            index={activeIndex}
            onChange={(nq) => updateQuestion(activeIndex, nq)}
            onAddOption={() => addOption(activeIndex)}
            onUpdateOption={(oi, patch) =>
              updateOption(activeIndex, oi, patch)
            }
            onRemoveOption={(oi) => removeOption(activeIndex, oi)}
            onSetCorrectSingle={(oi) => setCorrectSingle(activeIndex, oi)}
            onToggleCorrectMulti={(oi) => toggleCorrectMulti(activeIndex, oi)}
            onTogglePartial={() => togglePartialScoring(activeIndex)}
            fillBlank={
              q.question_type === QuestionType.FillInBlank
                ? {
                    addAcceptable: (slotIndex) =>
                      addFillAcceptableAnswer(activeIndex, slotIndex),
                    updateSlotPoints: (slotIndex, points) =>
                      updateFillSlotPoints(activeIndex, slotIndex, points),
                    updateAcceptable: (slotIndex, answerIndex, patch) =>
                      updateFillAcceptableAnswer(
                        activeIndex,
                        slotIndex,
                        answerIndex,
                        patch,
                      ),
                    removeAcceptable: (slotIndex, answerIndex) =>
                      removeFillAcceptableAnswer(
                        activeIndex,
                        slotIndex,
                        answerIndex,
                      ),
                    setSlotAnswerMode: (slotIndex, mode) =>
                      setFillBlankAnswerMode(activeIndex, slotIndex, mode),
                    updateChoiceOption: (slotIndex, optionIndex, patch) =>
                      updateFillChoiceOption(
                        activeIndex,
                        slotIndex,
                        optionIndex,
                        patch,
                      ),
                    addChoiceOption: (slotIndex) =>
                      addFillChoiceOption(activeIndex, slotIndex),
                    removeChoiceOption: (slotIndex, optionIndex) =>
                      removeFillChoiceOption(
                        activeIndex,
                        slotIndex,
                        optionIndex,
                      ),
                    setCorrectChoice: (slotIndex, optionIndex) =>
                      setFillChoiceCorrect(
                        activeIndex,
                        slotIndex,
                        optionIndex,
                      ),
                  }
                : undefined
            }
            onSave={handleSave}
            onSaveAndAddNext={handleSaveAndAddNext}
            isSaving={saveMutation.isPending || saveAndAddNextMutation.isPending}
            saveDisabled={
              pendingQuizImages > 0 ||
              saveAndAddNextMutation.isPending ||
              reorderSync.isPending ||
              (!isDirty && !isMetaDirty && !saveMutation.isPending)
            }
            reorderSyncPending={reorderSync.isPending}
            imageUploadsPending={pendingQuizImages > 0}
            questionsAutosaveBanner={questionsAutosaveBanner}
            questionSyncDetails={
              syncValidationError?.kind === "question" &&
              syncValidationError.questionIndex === activeIndex
                ? syncValidationError.details
                : undefined
            }
            onClearQuestionSyncErrors={clearQuestionSyncErrorsForActiveQuestion}
          />
        )}

        {questions.length === 0 && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8">
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => {
                addQuestion(QuestionType.SingleChoice);
                setActiveIndex(0);
              }}
            >
              Start adding question
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
