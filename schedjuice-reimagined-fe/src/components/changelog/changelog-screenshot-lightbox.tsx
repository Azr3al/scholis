"use client";
import { Button, Dialog } from "@/components/primitives";

import type { ChangelogScreenshot } from "@/content/changelog/types";
import { cn } from "@/lib/utils";
import { NavArrowLeft as ChevronLeft, NavArrowRight as ChevronRight } from "iconoir-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect } from "react";
import { VisuallyHidden } from "react-aria";

type ChangelogScreenshotLightboxProps = {
  screenshots: ChangelogScreenshot[];
  activeIndex: number | null;
  onActiveIndexChange: (index: number | null) => void;
};

export function ChangelogScreenshotLightbox({
  screenshots,
  activeIndex,
  onActiveIndexChange,
}: ChangelogScreenshotLightboxProps) {
  const isOpen = activeIndex !== null;
  const activeShot = activeIndex !== null ? screenshots[activeIndex] : null;
  const hasMultiple = screenshots.length > 1;

  const goToPrevious = useCallback(() => {
    if (activeIndex === null) return;
    onActiveIndexChange(activeIndex > 0 ? activeIndex - 1 : activeIndex);
  }, [activeIndex, onActiveIndexChange]);

  const goToNext = useCallback(() => {
    if (activeIndex === null) return;
    onActiveIndexChange(
      activeIndex < screenshots.length - 1 ? activeIndex + 1 : activeIndex,
    );
  }, [activeIndex, onActiveIndexChange, screenshots.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, goToPrevious, goToNext]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onActiveIndexChange(null);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-zinc-950/60 backdrop-blur-sm" />
        <Dialog.Popup
        className={cn(
          "gap-0 overflow-hidden p-0",
          "w-[min(1180px,94vw)] max-w-none",
          "max-h-[88dvh] rounded-[1.75rem]",
          "border border-border/60 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.12)]",
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-95",
        )}
      >
        <VisuallyHidden>
          <Dialog.Title>
            {activeShot ? `Screenshot: ${activeShot.alt}` : "Screenshot preview"}
          </Dialog.Title>
        </VisuallyHidden>

        <div className="relative flex min-h-0 flex-col bg-surface-sunken/20">
          {hasMultiple ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm" aria-label="Previous screenshot"
                disabled={activeIndex === 0}
                onClick={goToPrevious}
                className={cn(
                  "absolute left-2 top-1/2 z-10 -translate-y-1/2",
                  "size-9 rounded-full bg-surface/80 shadow-sm backdrop-blur-sm",
                  "hover:bg-surface active:scale-[0.98]",
                )}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm" aria-label="Next screenshot"
                disabled={activeIndex === screenshots.length - 1}
                onClick={goToNext}
                className={cn(
                  "absolute right-2 top-1/2 z-10 -translate-y-1/2",
                  "size-9 rounded-full bg-surface/80 shadow-sm backdrop-blur-sm",
                  "hover:bg-surface active:scale-[0.98]",
                )}
              >
                <ChevronRight className="size-5" aria-hidden />
              </Button>
            </>
          ) : null}

          <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-8">
            {activeShot ? (
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
                className="relative flex w-full items-center justify-center"
              >
                <Image
                  src={activeShot.src}
                  alt={activeShot.alt}
                  width={1600}
                  height={1000}
                  unoptimized
                  className="max-h-[calc(88dvh-3.5rem)] w-auto max-w-full object-contain"
                />
              </motion.div>
            ) : null}
          </div>

          {activeShot?.caption || hasMultiple ? (
            <div className="flex items-center justify-between gap-4 border-t border-border/50 bg-surface px-4 py-2.5 sm:px-6">
              {activeShot?.caption ? (
                <p className="text-xs leading-relaxed text-text-muted">
                  {activeShot.caption}
                </p>
              ) : (
                <span />
              )}
              {hasMultiple && activeIndex !== null ? (
                <p className="shrink-0 text-xs tabular-nums text-text-muted">
                  {activeIndex + 1} / {screenshots.length}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
