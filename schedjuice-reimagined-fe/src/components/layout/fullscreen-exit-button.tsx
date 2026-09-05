"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { Reduce as Minimize } from "iconoir-react";

import { cn } from "@/lib/utils";
import { useFullscreen } from "@/hooks/use-fullscreen";

interface FullscreenExitButtonProps {
  className?: string;
}

export function FullscreenExitButton({ className }: FullscreenExitButtonProps) {
  const { exit, effectiveFullscreen, label } = useFullscreen();

  if (!effectiveFullscreen) return null;

  return (
    <Button
      type="button"
      variant="secondary" size="sm"
      onClick={exit}
      className={cn(
        "fixed bottom-4 right-4 rounded-full border-border bg-background/95 px-3 shadow-[0_12px_30px_-18px_rgba(24,24,27,0.45)] backdrop-blur",
        "focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={`Exit ${label}`}
      title={`Exit ${label}`}
    >
      <Minimize className="mr-1.5 size-3.5" aria-hidden />
      Exit
    </Button>
  );
}
