"use client";
import { Button } from "@/components/primitives";

import { useEffect, useState } from "react";
import type { AutosaveStatus } from "./use-quiz-autosave";

type Props = {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  onRetry: () => void;
};

function savedSuffix(lastSavedAt: number | null, nowTick: number): string {
  if (lastSavedAt == null) return "";
  const elapsed = Math.max(0, nowTick - lastSavedAt);
  if (elapsed < 4000) return " · Just now";
  if (elapsed >= 60_000) return ""; // keep primary label plain "Saved" after ~1 min (spec)
  return ` · ${Math.floor(elapsed / 1000)}s ago`;
}

/**
 * Quiet dot status for quiz progress saves (non-blocking UX).
 */
export function QuizAutosaveStatus({ status, lastSavedAt, onRetry }: Props) {
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "saved") return;
    const i = window.setInterval(() => {
      setClock(Date.now());
    }, 15000);
    return () => window.clearInterval(i);
  }, [status]);

  useEffect(() => {
    setClock(Date.now());
  }, [lastSavedAt, status]);

  const now = clock;
  const relativeSuffix =
    status === "saved" ? savedSuffix(lastSavedAt, now) : "";
  const showRelative =
    relativeSuffix !== "" &&
    status === "saved" &&
    lastSavedAt != null;
  let title: string | undefined;
  if (lastSavedAt != null && status === "saved") {
    const secs = Math.floor(Math.max(0, now - lastSavedAt) / 1000);
    if (secs < 60) {
      title = `Last saved ${secs}s ago`;
    }
  }

  if (status === "idle") {
    return (
      <div className="text-text-muted flex min-h-[1.25rem] flex-wrap items-center gap-2 text-xs" />
    );
  }

  if (status === "saving") {
    return (
      <div
        className="text-text-muted flex min-h-[1.25rem] flex-wrap items-center gap-2 text-xs"
        aria-busy
      >
        <span
          className="size-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none"
          aria-hidden
        />
        <span>Saving</span>
      </div>
    );
  }

  if (status === "saved") {
    return (
      <div
        className="text-text-muted flex min-h-[1.25rem] flex-wrap items-center gap-2 text-xs"
        title={title}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        <span>Saved</span>
        {showRelative ? (
          <span className="text-text-muted/70">{relativeSuffix}</span>
        ) : null}
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div
        className="flex min-h-[1.25rem] flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400"
        role="status"
        aria-live="polite"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        <span>Offline — your answers are safe on this device</span>
      </div>
    );
  }

  /* error */
  return (
    <div
      className="text-danger flex min-h-[1.25rem] flex-wrap items-center gap-2 text-xs"
      role="alert"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
      <span>Couldn&apos;t save</span>
      <Button type="button" size="sm" variant="secondary" onClick={() => onRetry()}>
        Retry
      </Button>
      <span className="sr-only" aria-live="polite">
        Couldn&apos;t save your progress. Your answers are still kept on this
        device. Retry to try again.
      </span>
    </div>
  );
}
