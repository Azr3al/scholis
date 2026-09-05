"use client";

import { PaymentAssignmentMonthUiStatus } from "@/components/finances/student-payments-report";
import { Skeleton } from "@/components/primitives";
import { usePaymentAssignmentMonthStatus } from "@/hooks/finances/use-payment-assignment-month-status";
import { useTenant } from "@/hooks/useTenant";
import { teamsPaymentHandInLabel } from "@/lib/finances/teams-payment-assignment-status";
import { cn } from "@/lib/utils";

export function TeamsPaymentAssignmentStatusLine({
  courseId,
  monthAnchor,
}: {
  courseId: number | string;
  monthAnchor: Date;
}) {
  const { tenant } = useTenant();
  const { enabled, isLoading, isError, data } = usePaymentAssignmentMonthStatus({
    courseId,
    monthDate: monthAnchor,
    isMicrosoftOn: Boolean(tenant?.is_microsoft_on),
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Skeleton
        className="mt-1 h-4 w-full max-w-md"
        aria-busy="true"
        aria-label="Loading Teams payment assignment status"
      />
    );
  }

  if (isError) {
    return (
      <p className="mt-1 text-xs text-destructive" role="alert">
        Could not load Teams payment hand-in status.
      </p>
    );
  }

  if (!data) return null;

  const isMissing =
    data.status === PaymentAssignmentMonthUiStatus.ExpectedButMissing;

  return (
    <p
      className={cn(
        "mt-1 text-xs",
        isMissing
          ? "font-medium text-amber-800 dark:text-amber-200"
          : "text-muted-foreground",
      )}
    >
      {teamsPaymentHandInLabel(data.status, {
        creationWindowStart: data.creation_window_start,
        creationWindowEnd: data.creation_window_end,
      })}
    </p>
  );
}
