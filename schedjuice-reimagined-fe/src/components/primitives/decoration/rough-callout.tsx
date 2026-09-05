// src/components/primitives/decoration/rough-callout.tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RoughFrame } from "./rough-frame";

/** Soft callout box: framed content on a faint brand wash. */
export function RoughCallout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RoughFrame
      className={cn(
        "rounded-md bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-accent",
        className,
      )}
    >
      <div className="p-4 text-text-primary">{children}</div>
    </RoughFrame>
  );
}
