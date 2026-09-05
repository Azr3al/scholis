"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function studentPaymentsReportShellClassName(bounded = true): string {
  return cn(
    "flex w-full min-w-0 flex-col rounded-xl border border-border bg-background",
    "shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]",
    bounded && "h-[75dvh] overflow-hidden",
  );
}

export type StudentPaymentsReportHeaderProps = {
  /** Omit when the app shell already owns the page title via usePageHeader. */
  title?: string;
  summaryLine: ReactNode;
  actions?: ReactNode;
};

export function StudentPaymentsReportHeader({
  title,
  summaryLine,
  actions,
}: StudentPaymentsReportHeaderProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        {title ? (
          <p className="text-sm font-semibold tracking-tight">{title}</p>
        ) : null}
        <p className="truncate text-xs text-muted-foreground">{summaryLine}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function studentPaymentsSplitPaneMainClassName(bounded = true): string {
  return cn(
    "min-w-0 p-3",
    bounded && "flex h-full min-h-0 flex-col overflow-hidden",
  );
}

export function studentPaymentsSplitPaneGridClassName(bounded = true): string {
  return cn(
    "grid grid-cols-1",
    bounded && "min-h-0 flex-1 overflow-hidden",
  );
}

export type StudentPaymentsSplitPaneProps = {
  main: ReactNode;
  /** When false, pane grows with content and page scrolls (original ResourceTable). */
  bounded?: boolean;
};

export function StudentPaymentsSplitPane({
  main,
  bounded = true,
}: StudentPaymentsSplitPaneProps) {
  return (
    <div className={studentPaymentsSplitPaneGridClassName(bounded)}>
      <div className={studentPaymentsSplitPaneMainClassName(bounded)}>{main}</div>
    </div>
  );
}
