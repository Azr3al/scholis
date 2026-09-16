"use client";

import { cn } from "@/lib/utils";
import type { RowSaveState } from "./use-attendance-autosave";

type AttendanceRowSaveIndicatorProps = {
  state: RowSaveState;
  className?: string;
};

const STATE_LABELS: Record<RowSaveState, string> = {
  idle: "",
  pending: "Queued to save",
  saving: "Saving",
  saved: "Saved",
  error: "Could not save this row",
};

export function AttendanceRowSaveIndicator({
  state,
  className,
}: AttendanceRowSaveIndicatorProps) {
  const label = STATE_LABELS[state];

  return (
    <span
      role={state === "idle" ? "presentation" : "status"}
      aria-label={state === "idle" ? undefined : label}
      title={state === "idle" ? undefined : label}
      className={cn(
        "inline-flex size-2 shrink-0 rounded-full",
        state === "idle" && "bg-transparent",
        state === "pending" && "animate-pulse bg-warning motion-reduce:animate-none",
        state === "saving" && "animate-pulse bg-success motion-reduce:animate-none",
        state === "saved" && "bg-success",
        state === "error" && "bg-danger",
        className,
      )}
    />
  );
}
