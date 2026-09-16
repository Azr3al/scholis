"use client";

import { Button } from "@/components/primitives/button";
import { useEffect, useState } from "react";
import type { AttendanceAutosaveStatus } from "./use-attendance-autosave";

type AttendanceAutosaveStatusProps = {
  status: AttendanceAutosaveStatus;
  hasPendingChanges?: boolean;
  /** When false during saving, toolbar stays idle until delay elapses. Defaults to true. */
  savingIndicatorVisible?: boolean;
  lastSavedAt: number | null;
  onRetry: () => void;
};

function savedSuffix(lastSavedAt: number | null, nowTick: number): string {
  if (lastSavedAt == null) return "";
  const elapsed = Math.max(0, nowTick - lastSavedAt);
  if (elapsed < 4000) return " · Just now";
  if (elapsed >= 60_000) return "";
  return ` · ${Math.floor(elapsed / 1000)}s ago`;
}

export function AttendanceAutosaveStatusBar({
  status,
  hasPendingChanges = false,
  savingIndicatorVisible,
  lastSavedAt,
  onRetry,
}: AttendanceAutosaveStatusProps) {
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "saved") return;
    const interval = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    setClock(Date.now());
  }, [lastSavedAt, status]);

  const relativeSuffix =
    status === "saved" ? savedSuffix(lastSavedAt, clock) : "";
  const showRelative =
    relativeSuffix !== "" && status === "saved" && lastSavedAt != null;

  const showSaving =
    status === "saving" && (savingIndicatorVisible ?? true);

  const showUnsavedPending =
    hasPendingChanges && status !== "saving" && status !== "offline" && status !== "error";

  if (status === "idle" || (status === "saving" && !showSaving)) {
    if (showUnsavedPending) {
      return (
        <div
          className="flex min-h-[1.25rem] items-center gap-2 text-xs text-text-muted"
          role="status"
          aria-live="polite"
        >
          <span
            className="size-1.5 shrink-0 animate-pulse rounded-full bg-warning motion-reduce:animate-none"
            aria-hidden
          />
          <span>Unsaved changes</span>
        </div>
      );
    }
    return <div className="flex min-h-[1.25rem] items-center gap-2 text-xs" />;
  }

  if (showSaving) {
    return (
      <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-text-muted" aria-busy>
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-success motion-reduce:animate-none" aria-hidden />
        <span>Saving</span>
      </div>
    );
  }

  if (status === "saved") {
    if (showUnsavedPending) {
      return (
        <div
          className="flex min-h-[1.25rem] items-center gap-2 text-xs text-text-muted"
          role="status"
          aria-live="polite"
        >
          <span
            className="size-1.5 shrink-0 animate-pulse rounded-full bg-warning motion-reduce:animate-none"
            aria-hidden
          />
          <span>Unsaved changes</span>
        </div>
      );
    }

    return (
      <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-text-muted">
        <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
        <span>Saved</span>
        {showRelative ? (
          <span className="text-text-muted/70">{relativeSuffix}</span>
        ) : null}
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-warning-foreground" role="status" aria-live="polite">
        <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
        <span>Offline — changes queued on this device</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[1.25rem] items-center gap-2 text-xs text-danger" role="alert">
      <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
      <span>Could not save</span>
      <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
