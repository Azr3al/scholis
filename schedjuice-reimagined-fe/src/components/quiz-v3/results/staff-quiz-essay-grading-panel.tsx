"use client";
import { Button, Input, Textarea, useToast } from "@/components/primitives";

import {
  feedbackDocToPlainText,
  plainTextToFeedbackDoc,
} from "@/helpers/quiz-essay-feedback-doc";
import {
  useQuizV3PatchEssayAnswerMutation,
  type EssayCommentPatchRow,
} from "@/hooks/use-quiz-v3-grading-mutations";
import { QuestionType, type EssayCommentV3, type QuestionTypeV3 } from "@/types/quiz-v3";
import { useEffect, useMemo, useState } from "react";

type EssayAnswer = {
  id: number;
  score: string | number;
  response_text?: unknown;
  feedback?: unknown;
  comments?: EssayCommentV3[];
  graded_at?: string | null;
  question?: QuestionTypeV3 & { id: number };
};

function essayPlainText(responseText: unknown): string {
  if (!responseText || typeof responseText !== "object" || Array.isArray(responseText)) {
    return "";
  }
  const t = (responseText as { text?: unknown }).text;
  return typeof t === "string" ? t : "";
}

function normalizeCommentsFromApi(rows?: EssayCommentV3[]): EssayCommentPatchRow[] {
  if (!rows?.length) return [];
  return rows.map((c) => ({
    id: c.id,
    anchor_start: c.anchor_start,
    anchor_end: c.anchor_end,
    body: c.body ?? "",
  }));
}

function EssayAnswerCard({
  quizId,
  attemptId,
  answer,
}: {
  quizId: number;
  attemptId: number;
  answer: EssayAnswer;
}) {
  const toast = useToast();
  const q = answer.question;
  const maxPts = q?.points ?? 0;
  const prompt =
    q?.body_plaintext?.trim() ||
    (q?.id != null ? `Question ${q.id}` : "Essay question");
  const plain = essayPlainText(answer.response_text);
  const len = plain.length;

  const patch = useQuizV3PatchEssayAnswerMutation(quizId, attemptId);

  const [scoreInput, setScoreInput] = useState(() => String(answer.score ?? ""));
  const [feedbackPlain, setFeedbackPlain] = useState(() =>
    feedbackDocToPlainText(answer.feedback),
  );
  const [comments, setComments] = useState<EssayCommentPatchRow[]>(() =>
    normalizeCommentsFromApi(answer.comments),
  );

  useEffect(() => {
    setScoreInput(String(answer.score ?? ""));
    setFeedbackPlain(feedbackDocToPlainText(answer.feedback));
    setComments(normalizeCommentsFromApi(answer.comments));
  }, [answer.id, answer.score, answer.feedback, answer.comments]);

  const canAddComment = len > 0;

  const payloadComments = useMemo(
    () =>
      comments.map((c) => ({
        ...(c.id != null ? { id: c.id } : {}),
        anchor_start: c.anchor_start,
        anchor_end: c.anchor_end,
        body: c.body.trim(),
      })),
    [comments],
  );

  async function saveAll() {
    const body: Parameters<typeof patch.mutateAsync>[0] = {
      answerId: answer.id,
      feedback: plainTextToFeedbackDoc(feedbackPlain),
      comments: payloadComments,
    };
    const trimmedScore = scoreInput.trim();
    if (trimmedScore !== "") {
      const n = Number(trimmedScore);
      if (!Number.isFinite(n) || n < 0 || n > maxPts) {
        toast.add({
          description: `Enter a score from 0 to ${maxPts}.`,
        });
        return;
      }
      body.score = n;
    }
    try {
      await patch.mutateAsync(body);
      toast.add({ description: "Saved." });
    } catch {
      toast.add({
        description: "Could not save grading. Check anchors and try again."});
    }
  }

  return (
    <div className="border-border bg-surface-elevated space-y-4 rounded-xl border px-4 py-5 shadow-sm sm:px-5">
      <div>
        <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">
          Essay
        </p>
        <p className="mt-1 font-medium leading-snug">{prompt}</p>
        <p className="text-text-muted mt-2 text-sm">
          {answer.graded_at ? "Graded" : "Not graded yet"}
        </p>
      </div>

      <div>
        <p className="text-text-muted text-sm">Student answer</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed break-words">
          {plain || "—"}
        </p>
        {len > 0 ? (
          <p className="text-text-muted mt-2 text-xs">{len} characters</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={`essay-score-${answer.id}`}>Score (0–{maxPts})</label>
          <Input
            id={`essay-score-${answer.id}`}
            inputMode="decimal"
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            disabled={patch.isPending}
            className="tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={`essay-fb-${answer.id}`}>Written feedback (student-facing)</label>
        <Textarea
          id={`essay-fb-${answer.id}`}
          value={feedbackPlain}
          onChange={(e) => setFeedbackPlain(e.target.value)}
          disabled={patch.isPending}
          rows={4}
          className="resize-y"
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-base">Inline comments</label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canAddComment || patch.isPending}
            onClick={() =>
              setComments((prev) => [
                ...prev,
                { anchor_start: 0, anchor_end: Math.min(1, len), body: "" },
              ])
            }
          >
            Add comment
          </Button>
        </div>
        {!canAddComment ? (
          <p className="text-text-muted text-sm">
            Empty answers cannot use anchored comments.
          </p>
        ) : null}
        {comments.map((c, idx) => (
          <div
            key={c.id ?? `new-${idx}`}
            className="bg-surface-sunken/30 space-y-2 rounded-lg border p-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs">Start</label>
                <Input
                  inputMode="numeric"
                  value={String(c.anchor_start)}
                  onChange={(e) =>
                    setComments((prev) =>
                      prev.map((x, i) =>
                        i === idx
                          ? { ...x, anchor_start: Number(e.target.value) || 0 }
                          : x,
                      ),
                    )
                  }
                  disabled={patch.isPending}
                />
              </div>
              <div>
                <label className="text-xs">End</label>
                <Input
                  inputMode="numeric"
                  value={String(c.anchor_end)}
                  onChange={(e) =>
                    setComments((prev) =>
                      prev.map((x, i) =>
                        i === idx
                          ? { ...x, anchor_end: Number(e.target.value) || 0 }
                          : x,
                      ),
                    )
                  }
                  disabled={patch.isPending}
                />
              </div>
            </div>
            <div>
              <label className="text-xs">Note</label>
              <Textarea
                value={c.body}
                onChange={(e) =>
                  setComments((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, body: e.target.value } : x)),
                  )
                }
                disabled={patch.isPending}
                rows={2}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger"
              disabled={patch.isPending}
              onClick={() => setComments((prev) => prev.filter((_, i) => i !== idx))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" onClick={() => void saveAll()} isLoading={patch.isPending}>
        Save
      </Button>
    </div>
  );
}

type Props = {
  quizId: number;
  attemptId: number;
  answers: EssayAnswer[];
};

export function StaffQuizEssayGradingPanel({ quizId, attemptId, answers }: Props) {
  const essays = answers.filter(
    (a) => a.question?.question_type === QuestionType.Essay && a.question?.id != null,
  );
  if (essays.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Essay grading</h2>
      <p className="text-text-muted text-sm">
        Scores, feedback, and anchored comments save to this attempt. Release results from
        the responses list when you are ready for students to see them.
      </p>
      <div className="space-y-6">
        {essays.map((a) => (
          <EssayAnswerCard key={a.id} quizId={quizId} attemptId={attemptId} answer={a} />
        ))}
      </div>
    </div>
  );
}
