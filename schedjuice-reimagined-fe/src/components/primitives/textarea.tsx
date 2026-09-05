// src/components/primitives/textarea.tsx
import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface-sunken px-3 py-2 text-base leading-relaxed",
        "text-text-primary placeholder:text-text-muted resize-y",
        "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
