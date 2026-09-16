"use client";

import { Xmark } from "iconoir-react";

import { cn } from "@/lib/utils";

export function ClearFieldButton({
  label,
  onClear,
  disabled,
  className,
}: {
  label: string;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        "absolute top-1/2 z-10 -translate-y-1/2 rounded-sm p-1 text-text-muted",
        "hover:bg-surface-hover hover:text-text-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring)",
        "disabled:pointer-events-none disabled:opacity-50",
        "right-2",
        className,
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClear();
      }}
    >
      <Xmark width={16} height={16} aria-hidden />
    </button>
  );
}
