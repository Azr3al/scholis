import { Spinner } from "@/components/primitives/spinner";
import { Controller } from "react-hook-form";
"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useEffect, useState } from "react";
import { WarningTriangle as AlertTriangle, Check } from "iconoir-react";
import { AnimatePresence, motion } from "motion/react";
import { useAutosaveContext } from "@/components/form/autosave-context";
import { cn } from "@/lib/utils";
import type { FieldSaveState } from "@/lib/autosave/autosave-core";

const SAVED_FADE_MS = 1800;

function FieldSaveIndicatorContent({
  state,
  onRetry,
  className,
}: {
  state: FieldSaveState;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shadow-sm",
        state === "saving" &&
          "border-slate-200/80 bg-white text-muted-foreground",
        state === "saved" &&
          "border-emerald-200/80 bg-emerald-50 text-emerald-700",
        state === "error" &&
          "border-destructive/30 bg-destructive/5 text-destructive",
        className,
      )}
    >
      {state === "saving" && (
        <>
          <Spinner className="size-3 " aria-hidden />
          <span>Saving</span>
        </>
      )}
      {state === "saved" && (
        <>
          <Check className="size-3" aria-hidden />
          <span>Saved</span>
        </>
      )}
      {state === "error" && (
        <>
          <AlertTriangle className="size-3" aria-hidden />
          <span>Couldn't save</span>
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-auto px-1 py-0 text-xs text-destructive",
                "hover:bg-destructive/10 hover:text-destructive",
                "focus-visible:ring-destructive/30",
              )}
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </>
      )}
    </span>
  );
}

export function FieldAutosaveBadge({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const autosave = useAutosaveContext();
  const fieldName = String(name);
  const state = autosave?.fieldStatus[fieldName];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!state) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (state === "saved") {
      const timer = window.setTimeout(() => setVisible(false), SAVED_FADE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [state, fieldName]);

  if (!autosave || !state || !visible) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={`${fieldName}-${state}`}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={cn(
          "pointer-events-auto absolute right-0 top-0 z-10 -translate-y-1/2",
          "motion-reduce:transition-none",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <FieldSaveIndicatorContent
          state={state}
          onRetry={() => autosave.retry(fieldName)}
        />
      </motion.span>
    </AnimatePresence>
  );
}

/** @deprecated Use FieldAutosaveBadge via FormItem auto-injection. */
export function FieldSaveIndicator({
  state,
  onRetry,
  className,
}: {
  state?: FieldSaveState;
  onRetry?: () => void;
  className?: string;
}) {
  if (!state || state === "saved") return null;
  return (
    <FieldSaveIndicatorContent
      state={state}
      onRetry={onRetry}
      className={className}
    />
  );
}
