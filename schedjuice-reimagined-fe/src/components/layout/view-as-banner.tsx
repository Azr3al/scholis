"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useEffect, useState } from "react";
import { EyeClosed as EyeOff } from "iconoir-react";

import { useViewAsStore } from "@/store/view-as-store";
import { bannerStickyClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";

export function ViewAsBanner() {
  const active = useViewAsStore((state) => state.active);
  const label = useViewAsStore((state) => state.label);
  const exit = useViewAsStore((state) => state.exit);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !active) {
    return null;
  }

  return (
    <div className={cn(bannerStickyClassName, "border-b border-amber-500/40 bg-amber-50 px-4 py-2 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50")}>
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Viewing as <span className="font-semibold">{label}</span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary" className="border-amber-500/50 bg-background/80"
          onClick={() => exit()}
        >
          <EyeOff className="mr-2 h-4 w-4" />
          Exit view-as
        </Button>
      </div>
    </div>
  );
}
