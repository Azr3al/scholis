"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { cn } from "@/lib/utils";
import { resolveUtilityNotificationHref } from "@/lib/resolve-utility-notification-href";
import { useUtilityNotifications } from "@/hooks/useUtilityNotifications";
import { UtilityNotificationKind } from "@/types/utility-notification";
import Link from "next/link";
import { useMemo } from "react";
import { DashboardCard } from "../dashboard-card";

export default function PendingGradingWidget() {
  const { items, isLoading, error } = useUtilityNotifications();

  const gradingItems = useMemo(
    () =>
      items.filter(
        (item) => item.kind === UtilityNotificationKind.AssignmentToGrade,
      ),
    [items],
  );

  const count = gradingItems.length;
  const ctaHref =
    gradingItems[0] != null
      ? resolveUtilityNotificationHref(
          gradingItems[0].route,
          gradingItems[0].params,
        ) ?? "/courses"
      : "/courses";

  return (
    <DashboardCard
      title="Pending grading"
      span="md"
      loading={isLoading}
      empty={!isLoading && !error && count === 0}
      error={error ? "Could not load grading queue." : undefined}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs text-text-muted">Submissions to grade</p>
          <p className="font-mono text-3xl font-semibold tabular-nums">{count}</p>
        </div>
        {gradingItems[0] && (
          <p className="text-sm text-text-muted line-clamp-2">
            {gradingItems[0].body}
          </p>
        )}
        <Link
          href={ctaHref}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Grade submissions
        </Link>
      </div>
    </DashboardCard>
  );
}
