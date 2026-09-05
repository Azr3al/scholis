import type { ReactNode } from "react";

import {
  EmptyCopy,
  EmptyState,
  EMPTY_COPY_PRESETS,
} from "@/components/primitives/empty";
import { cn } from "@/lib/utils";

export type TableEmptyStateProps = {
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Reserved body height so empty ↔ content does not jump. */
  minHeightClassName?: string;
};

export function TableEmptyState({
  children,
  action,
  className,
  minHeightClassName = "min-h-[16rem]",
}: TableEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-surface",
        minHeightClassName,
        className,
      )}
    >
      <EmptyState action={action}>
        {children ?? <EmptyCopy {...EMPTY_COPY_PRESETS.nothingHere} />}
      </EmptyState>
    </div>
  );
}
