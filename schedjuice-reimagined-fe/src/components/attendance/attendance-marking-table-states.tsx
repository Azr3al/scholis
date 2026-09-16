"use client";
import { Button, Skeleton } from "@/components/primitives";

import { EmptyCopy } from "@/components/primitives/empty/empty-copy";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

const SKELETON_ROW_COUNT = 8;
const DESKTOP_COLUMNS = ["Student", "Alt name", "Phone", "Enrollment", "Status", "Note"] as const;

type AttendanceMarkingTableSkeletonProps = {
  loadingLabel?: string;
  isMobile?: boolean;
};

function DesktopTableSkeleton() {
  return (
    <div className="overflow-x-auto sj-scroll sj-root">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            {DESKTOP_COLUMNS.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <tr key={index} className="min-h-[52px] border-b border-border-subtle">
              <td className="px-3 py-3">
                <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
              </td>
              <td className="px-3 py-3">
                <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
              </td>
              <td className="px-3 py-3">
                <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
              </td>
              <td className="px-3 py-3">
                <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="size-9 shrink-0 rounded-md motion-reduce:animate-none"
                    />
                  ))}
                </div>
              </td>
              <td className="px-3 py-3">
                <Skeleton className="h-9 w-full max-w-xs motion-reduce:animate-none" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileTableSkeleton() {
  return (
    <div className="divide-y divide-border-subtle">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
        <div key={index} className="space-y-3 px-1 py-4">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-20 motion-reduce:animate-none" />
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-11 w-full rounded-md motion-reduce:animate-none"
              />
            ))}
          </div>
          <Skeleton className="h-9 w-full motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export function AttendanceMarkingTableSkeleton({
  loadingLabel = "Loading attendance roster…",
  isMobile = false,
}: AttendanceMarkingTableSkeletonProps) {
  return (
    <div aria-busy="true" aria-label={loadingLabel}>
      <span className="sr-only">{loadingLabel}</span>
      {isMobile ? <MobileTableSkeleton /> : <DesktopTableSkeleton />}
    </div>
  );
}

type AttendanceMarkingTableErrorProps = {
  onRetry?: () => void;
};

export function AttendanceMarkingTableError({ onRetry }: AttendanceMarkingTableErrorProps) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 border-b border-border-subtle py-12 text-center"
      role="alert"
    >
      <p className="text-sm font-medium text-text-primary">Could not load attendance</p>
      <p className="max-w-md text-sm text-text-muted">
        Check your connection and try again. Any changes already saved on this device remain on
        the server.
      </p>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

type AttendanceMarkingTableEmptyProps = {
  emptyPreset?: keyof typeof EMPTY_COPY_PRESETS;
  emptyDescription?: string;
};

export function AttendanceMarkingTableEmpty({
  emptyPreset = "noStudentsToMark",
  emptyDescription = "This class session has no enrolled students yet. Add students to the course to start marking attendance.",
}: AttendanceMarkingTableEmptyProps) {
  return (
    <div className="py-12 text-center">
      <EmptyCopy {...EMPTY_COPY_PRESETS[emptyPreset]} />
      <p className="mx-auto mt-3 max-w-md text-sm text-text-muted">{emptyDescription}</p>
    </div>
  );
}
