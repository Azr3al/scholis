"use client";

import { Button, Dialog } from "@/components/primitives";
import type { QuestionTypeV3 } from "@/types/quiz-v3";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: QuestionTypeV3[];
  answered: boolean[];
  markedReviewByIndex: boolean[];
  onGoToIndex: (i: number) => void;
  /** Opens the final Submit confirmation (`SubmitConfirmation`), not immediate POST. */
  onRequestSubmitConfirmation: () => void;
};

export function PreSubmitReviewDialog({
  open,
  onOpenChange,
  questions,
  answered,
  markedReviewByIndex,
  onGoToIndex,
  onRequestSubmitConfirmation,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-h-[min(90vh,640px)] max-w-xl overflow-y-auto">
          <Dialog.Title>Review before you submit</Dialog.Title>
          <Dialog.Description>
            Check unanswered items and flags, then confirm when you&apos;re ready.
          </Dialog.Description>
          <div className="border-border rounded-md border" role="table" aria-label="Question review">
            <div
              role="row"
              className="text-text-muted grid grid-cols-[2rem_minmax(0,1fr)_7rem_auto] gap-2 border-b px-3 py-2 text-xs font-medium"
            >
              <span>#</span>
              <span>Snippet</span>
              <span>Status</span>
              <span className="text-right">Go</span>
            </div>
            <div className="divide-y">
              {questions.map((q, i) => {
                const snippet = (q.body_plaintext ?? "").trim() || "Question";
                const mark = markedReviewByIndex[i] ?? false;
                const label = answered[i]
                  ? `Answered${mark ? " • Marked" : ""}`
                  : `Unanswered${mark ? " • Marked" : ""}`;
                return (
                  <div
                    key={q.id ?? i}
                    role="row"
                    className="hover:bg-surface-sunken/40 grid grid-cols-[2rem_minmax(0,1fr)_7rem_auto] gap-2 px-3 py-2 text-sm"
                  >
                    <span className="text-text-muted tabular-nums">{i + 1}</span>
                    <span className={cn("line-clamp-2 leading-snug", !answered[i] && "text-text-muted")}>
                      {snippet}
                    </span>
                    <span className={cn(mark && "font-medium text-amber-900 dark:text-amber-200")}>
                      {label}
                    </span>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="min-h-11"
                        onClick={() => {
                          onGoToIndex(i);
                          onOpenChange(false);
                        }}
                      >
                        Go
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Back to quiz
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => {
                onOpenChange(false);
                onRequestSubmitConfirmation();
              }}
            >
              Submit quiz
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
