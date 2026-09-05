"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type ErrorStateProps = {
  message?: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  minHeightClassName?: string;
};

export function ErrorState({
  message = "Couldn't load.",
  detail,
  onRetry,
  retryLabel = "Try again",
  className,
  minHeightClassName = "min-h-[16rem]",
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 bg-surface px-4 py-10 text-center",
        minHeightClassName,
        className,
      )}
      role="alert"
    >
      <p className="font-hand text-xl text-danger">{message}</p>
      {detail ? (
        <p className="max-w-md text-sm text-text-muted">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
