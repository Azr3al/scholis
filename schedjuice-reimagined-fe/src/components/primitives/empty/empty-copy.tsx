"use client";

import { HandHighlight } from "./hand-highlight";
import { type EmptyCopySlots } from "./empty-copy-slots";
import { cn } from "@/lib/utils";

export type EmptyCopyProps = EmptyCopySlots & {
  className?: string;
};

export function EmptyCopy({
  enBefore,
  enHighlight,
  enAfter,
  myBefore,
  myHighlight,
  myAfter,
  className,
}: EmptyCopyProps) {
  return (
    <p className={cn("font-hand text-hand text-brand", className)}>
      {enBefore}
      <HandHighlight>{enHighlight}</HandHighlight>
      {enAfter}
      {" · "}
      {myBefore}
      <HandHighlight>{myHighlight}</HandHighlight>
      {myAfter}
    </p>
  );
}
