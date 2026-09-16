"use client";
import { Button, useToast } from "@/components/primitives";

import { updateEntity } from "@/app/client-api/utils";
import { QuizPromptRichText } from "@/components/quiz-v3/editor/quiz-rich-text-editor";
import { QuizRichContentHtml } from "@/components/quiz-v3/shared/quiz-rich-content";
import { sanitizeQuizTiptapDoc } from "@/helpers/quizTiptapSanitize";
import { isQuizV3TiptapDocEmpty } from "@/helpers/quiz-v3-tiptap-empty";
import {
  QUIZ_V3_THEME_OPTIONS,
  quizV3TakeShellThemeClass,
  quizV3ThemeEditorSwatchClass,
} from "@/lib/quiz-v3-theme-presets";
import { cn } from "@/lib/utils";
import { useQuizV3EditorStore } from "@/store/quiz-v3";
import type { QuizTypeV3 } from "@/types/quiz-v3";
import { QuizThemeV3 } from "@/types/quiz-v3";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

type Props = { quizId: number };

function emptyDoc() {
  return { type: "doc" as const, content: [] };
}

export function QuizV3AppearanceForm({ quizId }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const quiz = useQuizV3EditorStore((s) => s.quiz);
  const setQuizMeta = useQuizV3EditorStore((s) => s.setQuizMeta);
  const isMetaDirty = useQuizV3EditorStore((s) => s.isMetaDirty);
  const [pendingQuizImages, setPendingQuizImages] = useState(0);
  const bumpQuizImagePending = useCallback((delta: number) => {
    setPendingQuizImages((n) => Math.max(0, n + delta));
  }, []);

  const saveAppearance = useMutation({
    mutationFn: async () => {
      const qz = useQuizV3EditorStore.getState().quiz as QuizTypeV3 | null;
      if (!qz?.id) throw new Error("No quiz");
      return updateEntity("quizzes", quizId, {
        intro_body: sanitizeQuizTiptapDoc(qz.intro_body ?? emptyDoc()),
        outro_body: sanitizeQuizTiptapDoc(qz.outro_body ?? emptyDoc()),
        quiz_theme: qz.quiz_theme ?? QuizThemeV3.Slate,
      });
    },
    onSuccess: (res) => {
      toast.add({ description: "Appearance saved." });
      const data = res?.data?.data as QuizTypeV3 | undefined;
      if (data) {
        useQuizV3EditorStore.getState().mergeQuizFromServer(data);
      }
      qc.setQueryData(["quiz-v3", quizId], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const o = old as { data?: { data?: QuizTypeV3 } };
        const cur = o.data?.data;
        const incoming = res?.data?.data as QuizTypeV3 | undefined;
        if (!cur || !incoming) return old;
        const { questions: _iq, ...meta } = incoming;
        return {
          ...o,
          data: {
            ...o.data,
            data: { ...cur, ...meta },
          },
        };
      });
    },
    onError: () => {
      toast.add({
        description: "Could not save appearance. Try again."});
    },
  });

  if (!quiz?.id) {
    return null;
  }

  const q = quiz as QuizTypeV3;
  const theme = q.quiz_theme ?? QuizThemeV3.Slate;

  return (
    <div className="max-w-xl space-y-8">
      <div className="space-y-3">
        <div>
          <label className="text-base">Theme</label>
          <p className="text-text-muted mt-1 text-sm">
            Preset colors for the learner quiz screen (accessibility-friendly).
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {QUIZ_V3_THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setQuizMeta({ quiz_theme: opt.value })}
              className={cn(
                "flex flex-col items-stretch rounded-lg border p-3 text-left transition-colors",
                "hover:bg-surface-sunken/50 cursor-pointer",
                theme === opt.value
                  ? "border-primary bg-accent/5 ring-1 ring-primary/30"
                  : "border-border bg-surface",
              )}
            >
              <div
                className={cn(
                  "mb-2.5 h-12 w-full shrink-0 rounded-md shadow-inner ring-1 ring-inset ring-black/10 dark:ring-white/15",
                  quizV3ThemeEditorSwatchClass(opt.value),
                )}
                aria-hidden
              />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-text-muted text-xs">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-base">Learner screen preview</label>
        <p className="text-text-muted text-sm">
          Illustrative only — shows theme wash and start-screen layout.
        </p>
        <div
          className="mx-auto w-full max-w-sm"
          role="img"
          aria-label="Theme preview, illustrative only"
        >
          <div
            className={cn(
              "overflow-hidden rounded-2xl border border-border shadow-md",
              quizV3TakeShellThemeClass(theme),
            )}
          >
            <header className="border-border/60 bg-surface/90 flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-text-muted text-xs font-medium">Quiz</span>
              <span className="text-text-muted text-[10px] uppercase tracking-wide">
                Preview
              </span>
            </header>
            <div className="px-3 py-4 sm:px-4 sm:py-5">
              <div className="bg-surface border-border/60 rounded-xl border px-3 py-3 shadow-sm sm:px-4 sm:py-4">
                <p className="text-sm font-semibold tracking-tight">Sample quiz title</p>
                <p className="text-text-muted mt-1 text-xs leading-snug">
                  Shown with your school logo on the real start screen.
                </p>
                {!isQuizV3TiptapDocEmpty(q.intro_body) ? (
                  <div className="text-text-primary/90 mt-3 max-h-24 overflow-hidden text-xs [&_.ProseMirror]:text-xs">
                    <QuizRichContentHtml value={q.intro_body} />
                  </div>
                ) : (
                  <p className="text-text-muted mt-3 text-xs italic">
                    Your intro will appear here once you add it above.
                  </p>
                )}
                <div className="mt-4">
                  <div className="bg-accent text-accent-foreground inline-flex rounded-md px-3 py-1.5 text-xs font-medium opacity-90 pointer-events-none">
                    Begin (example)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="quiz-v3-intro">Before the quiz</label>
        <p className="text-text-muted text-xs">
          Shown on the start screen with your school logo. Timer starts only after
          students tap Begin.
        </p>
        <QuizPromptRichText
          body={q.intro_body ?? emptyDoc()}
          onChange={(patch) => setQuizMeta({ intro_body: patch.body })}
          quizId={quizId}
          onImageUploadPendingDelta={bumpQuizImagePending}
          enableFillBlank={false}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="quiz-v3-outro">After submit</label>
        <p className="text-text-muted text-xs">
          Shown after students submit, before the results page. Leave empty to skip
          this step.
        </p>
        <QuizPromptRichText
          body={q.outro_body ?? emptyDoc()}
          onChange={(patch) => setQuizMeta({ outro_body: patch.body })}
          quizId={quizId}
          onImageUploadPendingDelta={bumpQuizImagePending}
          enableFillBlank={false}
        />
      </div>

      <Button
        type="button"
        className="cursor-pointer"
        isLoading={saveAppearance.isPending}
        variant="secondary"
        disabled={!isMetaDirty || pendingQuizImages > 0}
        onClick={() => saveAppearance.mutate()}
      >
        Save appearance
      </Button>
    </div>
  );
}
