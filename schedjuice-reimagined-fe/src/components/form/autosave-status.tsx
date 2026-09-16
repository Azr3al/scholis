"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, buttonVariants } from "@/components/primitives";

import { useEffect, useState } from "react";
import { WarningTriangle as AlertTriangle, Check } from "iconoir-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { FormSaveStatus } from "@/lib/autosave/autosave-core";

const SAVED_DISMISS_MS = 2000;

export function AutosaveStatus({
  status,
  onRetryAll,
  className,
}: {
  status: FormSaveStatus;
  onRetryAll?: () => void;
  className?: string;
}) {
  if (status === "idle") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {status === "saving" && (
        <>
          <Spinner className="size-3.5 " aria-hidden />
          <span>Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="size-3.5 text-emerald-600" aria-hidden />
          <span>All changes saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
          <span className="text-destructive">Couldn't save changes</span>
          {onRetryAll && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-auto px-1.5 py-0.5 text-xs text-destructive",
                "hover:bg-destructive/10 hover:text-destructive",
                "focus-visible:ring-destructive/30",
              )}
              onClick={onRetryAll}
            >
              Retry all
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function GlobalAutosaveStatus({
  status,
  onRetryAll,
}: {
  status: FormSaveStatus;
  onRetryAll?: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "idle") {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (status === "saved") {
      const timer = window.setTimeout(() => setVisible(false), SAVED_DISMISS_MS);
      return () => window.clearTimeout(timer);
    }
  }, [status]);

  return (
    <AnimatePresence>
      {visible && status !== "idle" ? (
        <motion.div
          key={status}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className={cn(
            "fixed bottom-6 right-6 z-toast flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-[0_20px_40px_-15px_rgba(0,0,0,0.12)]",
            "motion-reduce:transition-none",
            status === "saving" &&
              "border-slate-200/80 bg-white text-muted-foreground",
            status === "saved" &&
              "border-emerald-200/80 bg-emerald-50 text-emerald-800",
            status === "error" &&
              "border-destructive/30 bg-white text-destructive",
          )}
        >
          {status === "saving" && (
            <>
              <Spinner className="size-4 " aria-hidden />
              <span>Saving changes...</span>
            </>
          )}
          {status === "saved" && (
            <>
              <Check className="size-4 text-emerald-600" aria-hidden />
              <span>All changes saved</span>
            </>
          )}
          {status === "error" && (
            <>
              <AlertTriangle className="size-4" aria-hidden />
              <span>Couldn't save changes</span>
              {onRetryAll && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-auto px-2 py-0.5 text-sm text-destructive",
                    "hover:bg-destructive/10 hover:text-destructive",
                    "focus-visible:ring-destructive/30",
                  )}
                  onClick={onRetryAll}
                >
                  Retry all
                </Button>
              )}
            </>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
