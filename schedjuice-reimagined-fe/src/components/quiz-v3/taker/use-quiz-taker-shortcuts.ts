"use client";

import { useEffect } from "react";

function targetIsTypingField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null | undefined;
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const ce = el.getAttribute?.("contenteditable");
  return ce === "true" || el.isContentEditable;
}

export type QuizTakerShortcutHandlers = {
  /** When false (e.g. loading), listener is not attached. */
  enabled: boolean;
  goNext: () => void;
  goPrev: () => void;
  toggleFlagCurrent: () => void;
  openReviewDialog: () => void;
  openHelpDialog: () => void;
};

/**
 * Quiz taker keyboard shortcuts: J or ArrowDown next, K or ArrowUp prev, F flag,
 * Ctrl/Cmd+Enter opens review (skipped when focus is in a textarea), Shift+/ opens help.
 */
export function useQuizTakerShortcuts(opts: QuizTakerShortcutHandlers): void {
  useEffect(() => {
    if (!opts.enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Slash" && e.shiftKey) {
        e.preventDefault();
        opts.openHelpDialog();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const el = e.target as HTMLElement | undefined;
        if (el?.tagName?.toUpperCase() === "TEXTAREA") return;
        e.preventDefault();
        opts.openReviewDialog();
        return;
      }

      if (targetIsTypingField(e.target)) return;

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        opts.toggleFlagCurrent();
        return;
      }

      if (["j", "J", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        opts.goNext();
        return;
      }
      if (["k", "K", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        opts.goPrev();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    opts.enabled,
    opts.goNext,
    opts.goPrev,
    opts.toggleFlagCurrent,
    opts.openReviewDialog,
    opts.openHelpDialog,
  ]);
}
