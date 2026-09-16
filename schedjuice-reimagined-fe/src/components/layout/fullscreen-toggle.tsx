"use client";
import { Button } from "@/components/primitives";

import { Expand, Reduce as Minimize } from "iconoir-react";

import { useFullscreen } from "@/hooks/use-fullscreen";
import { cn } from "@/lib/utils";

type FullscreenToggleProps = {
  prominent?: boolean;
};

export function FullscreenToggle({ prominent = false }: FullscreenToggleProps) {
  const { toggle, effectiveFullscreen, isFullscreenAvailable, label } =
    useFullscreen();

  if (!isFullscreenAvailable) return null;

  const exitLabel = effectiveFullscreen ? "Exit" : "Fullscreen";

  return (
    <Button
      size={prominent ? "md" : "sm"}
      variant="secondary"
      onClick={toggle}
      className={cn(prominent && "h-9 shrink-0 gap-1.5")}
      aria-label={effectiveFullscreen ? `Exit ${label}` : `Enter ${label}`}
      title={effectiveFullscreen ? `Exit ${label}` : `Enter ${label}`}
    >
      {effectiveFullscreen ? (
        <Minimize className="size-4" aria-hidden />
      ) : (
        <Expand className="size-4" aria-hidden />
      )}
      {prominent ? exitLabel : null}
    </Button>
  );
}
