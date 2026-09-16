"use client";

import { cn } from "@/lib/utils";
import { useFindPage } from "./use-find-page";

export function FindPageTipsLink() {
  const { replayOnboarding } = useFindPage();

  return (
    <button
      type="button"
      onClick={replayOnboarding}
      aria-label="Show Find a page tips again"
      className={cn(
        "shrink-0 text-sm text-text-secondary underline-offset-2",
        "hover:text-text-primary hover:underline",
        "outline-none focus-visible:outline-none",
      )}
    >
      Tips
    </button>
  );
}
