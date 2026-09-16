"use client";

import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type UserMatchFooterAction = {
  label: string;
  variant?: "ghost" | "primary";
  onClick: () => void;
};

type Props = {
  actions: UserMatchFooterAction[];
  compact?: boolean;
  className?: string;
};

export function UserMatchFooterActions({ actions, compact = false, className }: Props) {
  if (actions.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap justify-end",
        compact ? "gap-1 border-t border-border pt-1.5" : "gap-2 pt-1",
        className,
      )}
    >
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant={action.variant === "primary" ? "primary" : "ghost"}
          size="sm"
          className={action.variant === "primary" ? "active:scale-[0.98]" : undefined}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
