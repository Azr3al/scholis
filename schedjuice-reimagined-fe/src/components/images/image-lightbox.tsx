"use client";

import { Dialog } from "@/components/primitives";
import { crossfadeInstant, popIn } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { VisuallyHidden } from "react-aria";

export function ImageLightbox({
  imageUrl,
  title = "Screenshot",
  onClose,
}: {
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const imageVariants = reduced ? crossfadeInstant : popIn;

  return (
    <Dialog.Root
      open={!!imageUrl}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop-blur-sm" />
        <Dialog.Popup
          className={cn(
            "gap-0 overflow-hidden p-0",
            "w-[min(1180px,94vw)] max-w-none",
            "max-h-[88dvh] rounded-[1.75rem]",
            "border border-border/60 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.12)]",
          )}
        >
          <VisuallyHidden>
            <Dialog.Title>{title}</Dialog.Title>
          </VisuallyHidden>

          <div className="relative flex min-h-0 flex-col bg-muted/20">
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-8">
              <AnimatePresence mode="wait">
                {imageUrl ? (
                  <motion.div
                    key={imageUrl}
                    variants={imageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="relative flex w-full items-center justify-center"
                  >
                    <Image
                      src={imageUrl}
                      alt={title}
                      width={1600}
                      height={1200}
                      unoptimized
                      className="max-h-[calc(88dvh-2rem)] w-auto max-w-full object-contain"
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
