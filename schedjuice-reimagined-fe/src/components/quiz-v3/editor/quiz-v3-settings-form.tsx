"use client";
import { Button, Input, Switch, useToast } from "@/components/primitives";

import { updateEntity } from "@/app/client-api/utils";
import { relationFkToPkNullable } from "@/helpers/relation-fk";
import { DateTimePicker } from "@/components/users/date-time-picker";
import { useQuizV3EditorStore } from "@/store/quiz-v3";
import type { QuizTypeV3 } from "@/types/quiz-v3";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

type Props = { quizId: number };

function quizIsoToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function QuizV3SettingsForm({ quizId }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const quiz = useQuizV3EditorStore((s) => s.quiz);
  const setQuizMeta = useQuizV3EditorStore((s) => s.setQuizMeta);
  const isMetaDirty = useQuizV3EditorStore((s) => s.isMetaDirty);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const qz = useQuizV3EditorStore.getState().quiz as QuizTypeV3 | null;
      if (!qz?.id) throw new Error("No quiz");
      return updateEntity("quizzes", quizId, {
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
      });
    },
    onSuccess: (res) => {
      toast.add({ description: "Settings saved." });
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
        description: "Could not save settings. Try again."});
    },
  });

  const trySave = useCallback(() => {
    const qz = useQuizV3EditorStore.getState().quiz;
    const act = qz?.activation_date;
    const exp = qz?.expiry_date;
    if (act && exp) {
      const a = new Date(act).getTime();
      const e = new Date(exp).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(e) && a > e) {
        toast.add({
          description: "Expiry must be the same time or after activation."});
        return;
      }
    }
    if (!qz?.title?.trim()) {
      toast.add({
        description: "Title is required."});
      return;
    }
    saveSettings.mutate();
  }, [saveSettings, toast]);

  if (!quiz?.id) {
    return null;
  }

  const q = quiz as QuizTypeV3;

  return (
    <div className="grid max-w-xl gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor="quiz-v3-settings-title">Title</label>
        <Input
          id="quiz-v3-settings-title"
          value={q.title ?? ""}
          onChange={(e) => setQuizMeta({ title: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="quiz-v3-settings-retakes">Max attempts</label>
        <Input
          id="quiz-v3-settings-retakes"
          type="number"
          min={1}
          value={q.max_retakes ?? 1}
          onChange={(e) =>
            setQuizMeta({ max_retakes: Number(e.target.value) })
          }
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="quiz-v3-settings-minutes">Time limit (minutes)</label>
        <Input
          id="quiz-v3-settings-minutes"
          type="number"
          min={1}
          value={q.allowed_minutes ?? 60}
          onChange={(e) =>
            setQuizMeta({ allowed_minutes: Number(e.target.value) })
          }
        />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 sm:col-span-2">
        <div className="space-y-0.5">
          <label htmlFor="quiz-v3-show-answers" className="text-sm font-medium">
            Show answers after submission
          </label>
          <p className="text-text-muted text-xs">
            When on, students can see correct answers after they finish.
          </p>
        </div>
        <Switch
          id="quiz-v3-show-answers"
          checked={!!q.can_show_answers_afterwards}
          onCheckedChange={(c) =>
            setQuizMeta({ can_show_answers_afterwards: c })
          }
        />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 sm:col-span-2">
        <div className="space-y-0.5">
          <label
            htmlFor="quiz-v3-navigate-questions"
            className="text-sm font-medium"
          >
            Any question order
          </label>
          <p className="text-text-muted text-xs">
            When on, students can open any question, skip, and go back. When off,
            they move forward in order but can still review earlier questions.
          </p>
        </div>
        <Switch
          id="quiz-v3-navigate-questions"
          checked={!!q.can_navigate_questions}
          onCheckedChange={(c) => setQuizMeta({ can_navigate_questions: c })}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <label htmlFor="quiz-v3-activation">Activation (optional)</label>
            <p className="text-text-muted text-xs">
              Before this time, students cannot start the quiz.
            </p>
          </div>
          {q.activation_date ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setQuizMeta({ activation_date: null })}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <DateTimePicker
          date={quizIsoToDate(q.activation_date) ?? undefined}
          setDate={(d) =>
            setQuizMeta({
              activation_date: d ? d.toISOString() : null,
            })
          }
          placeholder="Choose date and time"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <label htmlFor="quiz-v3-expiry">Expiry (optional)</label>
            <p className="text-text-muted text-xs">
              After this time, students cannot start the quiz.
            </p>
          </div>
          {q.expiry_date ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setQuizMeta({ expiry_date: null })}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <DateTimePicker
          date={quizIsoToDate(q.expiry_date) ?? undefined}
          setDate={(d) =>
            setQuizMeta({
              expiry_date: d ? d.toISOString() : null,
            })
          }
          placeholder="Choose date and time"
        />
      </div>
      <div className="sm:col-span-2">
        <Button
          type="button"
          className="cursor-pointer"
          isLoading={saveSettings.isPending}
          variant="secondary"
          disabled={!isMetaDirty}
          onClick={trySave}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
}
