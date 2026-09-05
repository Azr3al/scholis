"use client";
import { Button, Sheet } from "@/components/primitives";

import { cn } from "@/lib/utils";
import { List } from "iconoir-react";
import { useState } from "react";

type Props = {
  total: number;
  currentIndex: number;
  answered: boolean[];
  /** Per-question “mark for review” (server-persisted flag). */
  markedForReview?: boolean[];
  onGoTo: (index: number) => void;
  canNavigateQuestions: boolean;
  /** Highest question index the student may open (linear mode). */
  maxReachableIndex: number;
};

export function QuestionNavPanel({
  total,
  currentIndex,
  answered,
  markedForReview,
  onGoTo,
  canNavigateQuestions,
  maxReachableIndex,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const tryGo = (i: number) => {
    const allowed = canNavigateQuestions || i <= maxReachableIndex;
    if (!allowed) return;
    onGoTo(i);
    setSheetOpen(false);
  };

  const renderButton = (i: number, keyPrefix: string) => {
    const disabled = !canNavigateQuestions && i > maxReachableIndex;
    const isCurrent = i === currentIndex;
    const isAnswered = answered[i] ?? false;
    const forReview = markedForReview?.[i] ?? false;
    return (
      <Button
        key={`${keyPrefix}-${i}`}
        type="button"
        size="sm"
        variant={isCurrent ? "primary" : "secondary"}
        disabled={disabled}
        className={cn(
          "min-h-11 min-w-11 px-2 md:h-9 md:min-h-11",
          isAnswered && !isCurrent && "border-primary/55",
          forReview && !isCurrent && "border-amber-500/60",
          disabled && "opacity-40",
        )}
        aria-current={isCurrent ? "step" : undefined}
        onClick={() => tryGo(i)}
      >
        {i + 1}
      </Button>
    );
  };

  return (
    <>
      <div className="md:hidden">
        <Sheet.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Sheet.Trigger
            render={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full justify-center gap-2 touch-manipulation"
              >
                <List className="size-4 shrink-0" aria-hidden />
                Questions
              </Button>
            }
          />
          <Sheet.Portal>
            <Sheet.Backdrop />
            <Sheet.Popup side="bottom" className="max-h-[min(85vh,560px)]">
            <Sheet.Title>Questions</Sheet.Title>
            <div
              className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-8"
              role="navigation"
              aria-label="Question navigation"
            >
              {Array.from({ length: total }, (_, i) => renderButton(i, "m"))}
            </div>
            </Sheet.Popup>
          </Sheet.Portal>
        </Sheet.Root>
      </div>

      <aside
        className="bg-surface-sunken/20 hidden w-44 shrink-0 flex-col gap-1 rounded-md border p-2 md:flex"
        aria-label="Question navigation"
      >
        <p className="text-text-muted px-1 text-xs font-medium">Questions</p>
        <nav className="flex flex-col gap-1">
          {Array.from({ length: total }, (_, i) => renderButton(i, "d"))}
        </nav>
      </aside>
    </>
  );
}
