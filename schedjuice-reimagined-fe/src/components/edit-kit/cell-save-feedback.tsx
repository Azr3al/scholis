"use client";

import { FormSaveTick } from "@/components/edit-kit/form-save-tick";
import type { CellAutosaveStatus } from "@/components/edit-kit/use-cell-autosave";
import { Spinner } from "@/components/primitives/spinner";
import { cn } from "@/lib/utils";

export function CellSaveFeedback({
  status,
  showSavedTick,
  className,
}: {
  status: CellAutosaveStatus;
  showSavedTick: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[1.25rem] min-w-[4.5rem] shrink-0 items-center",
        className,
      )}
      aria-live="polite"
    >
      {status === "saving" ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>Saving…</span>
        </span>
      ) : (
        <FormSaveTick visible={showSavedTick} />
      )}
    </div>
  );
}
