"use client";

import { borderlessEventChipClass } from "@/components/calendar/event-chip";
import { cn } from "@/lib/utils";

export type SessionChipAccent = "brand" | "secondary";

export type SessionChipProps = {
  title: string;
  timeLabel: string;
  isPast?: boolean;
  showTitle?: boolean;
  accent?: SessionChipAccent;
  onClick?: () => void;
  className?: string;
};

export function SessionChip({
  title,
  timeLabel,
  isPast = false,
  showTitle = true,
  accent = "brand",
  onClick,
  className,
}: SessionChipProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation();
              onClick();
            }
          : undefined
      }
      title={showTitle ? title : timeLabel || title}
      className={cn(
        borderlessEventChipClass,
        "flex w-full max-w-full items-center gap-1.5",
        onClick && "cursor-pointer",
        isPast && "opacity-70",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          accent === "secondary" ? "bg-status-blue" : "bg-brand",
        )}
      />
      <span className="min-w-0 truncate font-mono text-xs tabular-nums text-text-muted">
        {timeLabel}
      </span>
      {showTitle ? (
        <span className="min-w-0 truncate text-xs text-text-primary">{title}</span>
      ) : null}
    </Comp>
  );
}
