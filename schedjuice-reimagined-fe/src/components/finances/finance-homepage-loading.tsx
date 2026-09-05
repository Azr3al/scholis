import { Card, CardContent, CardHeader } from "@/app/_chrome/card";
import { Skeleton } from "@/components/primitives/skeleton";
import { Spinner } from "@/components/primitives/spinner";
import { dashboardSectionStackClassName } from "@/lib/ui-remediation/r7-dashboard-layout-classes";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const STAT_LABELS = ["Collected", "Payments", "Unpaid amount", "Unpaid students"];

export function FinanceHomepageSectionOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]"
      aria-hidden
    >
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export function FinanceHomepageInitialSkeleton() {
  return (
    <div className={dashboardSectionStackClassName()} aria-busy="true">
      <div className="flex gap-2 overflow-x-auto pb-2 md:hidden">
        <Skeleton className="h-8 w-24 shrink-0 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-8 w-28 shrink-0 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-8 w-32 shrink-0 rounded-full motion-reduce:animate-none" />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <Skeleton className="h-8 w-40 rounded-md motion-reduce:animate-none" />
        <Skeleton className="h-8 w-44 rounded-md motion-reduce:animate-none" />
        <Skeleton className="h-5 w-32 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-28 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-36 motion-reduce:animate-none" />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_LABELS.map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-28 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-16 motion-reduce:animate-none" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {["Daily collections", "Payment breakdown"].map((title) => (
          <div
            key={title}
            className="flex min-h-[360px] flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <div className="space-y-1">
              <Skeleton className="h-5 w-36 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
            </div>
            <Skeleton className="min-h-[280px] flex-1 rounded-md motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceHomepageRefreshingShell({
  children,
  isRefreshing,
  className,
}: {
  children: ReactNode;
  isRefreshing: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {children}
      <FinanceHomepageSectionOverlay show={isRefreshing} />
    </div>
  );
}
