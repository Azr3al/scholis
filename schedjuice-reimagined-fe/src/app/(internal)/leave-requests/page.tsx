"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ListRowsSkeleton } from "@/components/loading/structured-skeletons";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { formatEnrolledCourses } from "@/lib/leave-requests/format-enrolled-courses";
import { LeaveRequestStatus } from "@/sdk/_types/leave-requests";
import { useLeaveRequestsList } from "@/sdk/hooks/leave-requests";
import { cn } from "@/lib/utils";

const STATUS_TABS: { label: string; value: string | undefined }[] = [
  { label: "Pending", value: LeaveRequestStatus.Pending },
  { label: "Approved", value: LeaveRequestStatus.Approved },
  { label: "Denied", value: LeaveRequestStatus.Denied },
  { label: "Cancelled", value: LeaveRequestStatus.Cancelled },
  { label: "All", value: undefined },
];

function formatDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} – ${end}`;
}

function studentName(student: unknown): string {
  if (student && typeof student === "object" && "name" in student) {
    return String((student as { name: string }).name);
  }
  return "Student";
}

export default function LeaveRequestsPage() {
  const [status, setStatus] = useState<string | undefined>(
    LeaveRequestStatus.Pending,
  );

  const list = useLeaveRequestsList({ status, size: 200 });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Leave requests</h1>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  const pendingCount =
    status === LeaveRequestStatus.Pending
      ? (list.data?.rows.length ?? 0)
      : undefined;
  const showListSkeleton = list.isLoading && !list.data;

  return (
    <PageContainer width="wide">
      <div className="flex flex-col gap-6 py-6">
        <p className="text-sm text-muted-foreground">
          Review student leave requests and approve or deny them.
        </p>

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.label}
              type="button"
              size="sm"
              variant={status === tab.value ? "primary" : "secondary"}
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
              {tab.value === LeaveRequestStatus.Pending && pendingCount != null
                ? ` (${pendingCount})`
                : null}
            </Button>
          ))}
        </div>

        {showListSkeleton ? (
          <div aria-busy="true">
            <ListRowsSkeleton rows={5} />
          </div>
        ) : null}

        {list.isError ? (
          <p className="text-sm text-destructive">
            Could not load leave requests.
          </p>
        ) : null}

        {!showListSkeleton &&
        !list.isError &&
        (list.data?.rows.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No requests in this tab.
          </p>
        ) : null}

        {!showListSkeleton ? (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {(list.data?.rows ?? []).map((row) => {
              const coursesLabel = formatEnrolledCourses(row.enrolled_courses);

              return (
                <li key={row.id}>
                  <Link
                    href={`/leave-requests/${row.id}`}
                    className={cn(
                      "flex flex-col gap-1 px-4 py-3 transition-colors",
                      "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-text-primary">
                        {studentName(row.student)}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {row.status}
                      </span>
                    </div>
                    {coursesLabel ? (
                      <span className="text-sm text-muted-foreground">
                        {coursesLabel}
                      </span>
                    ) : null}
                    <span className="text-sm text-text-primary">
                      {formatDateRange(row.start_date, row.end_date)}
                    </span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {row.reason}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </PageContainer>
  );
}
