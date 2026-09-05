"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Xmark as X } from "iconoir-react";

export type LinkNotice = {
  id: number;
  tokenRaw: string;
  count: number;
  onUndo: () => void;
};

export function LinkNoticeBar({
  notice,
  onDismiss,
}: {
  notice: LinkNotice | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [notice?.id, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-banner flex justify-center px-4">
      <AnimatePresence mode="wait">
        {notice ? (
          <motion.div
            key={notice.id}
            role="status"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="pointer-events-auto flex w-[min(420px,calc(100vw-2rem))] items-center justify-between gap-4 rounded-xl border border-border/80 bg-popover/95 px-4 py-2.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] backdrop-blur-sm dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]"
          >
            <p className="min-w-0 truncate text-sm tracking-tight text-foreground">
              Linked &ldquo;{notice.tokenRaw}&rdquo; across {notice.count}{" "}
              rows
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                className="active:scale-[0.98]"
                onClick={() => {
                  notice.onUndo();
                  onDismiss();
                }}
              >
                Undo
              </Button>
              <Button
                size="sm" variant="ghost"
                className="h-8 w-8 active:scale-[0.98]"
                onClick={onDismiss}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
