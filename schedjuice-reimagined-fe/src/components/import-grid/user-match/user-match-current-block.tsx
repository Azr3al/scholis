"use client";

import { cn } from "@/lib/utils";

type Props = {
  label: string;
  className?: string;
};

export function UserMatchCurrentBlock({ label, className }: Props) {
  return (
    <p className={cn("mb-1.5 truncate rounded bg-muted/40 px-2 py-1 text-xs", className)}>
      Current: <span className="font-medium">{label}</span>
    </p>
  );
}
