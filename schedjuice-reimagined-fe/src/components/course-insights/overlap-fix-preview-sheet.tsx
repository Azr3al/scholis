"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, Sheet, useToast } from "@/components/primitives";
import { RescheduleConflictsDialog } from "@/components/calendar/reschedule-conflicts-dialog";

import {
  applyOverlapFix,
  applyOverlapReschedule,
  fetchOverlapFixPreview,
  formatOverlapSessionTime,
} from "@/helpers/course-insights";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import type { OverlapFixCluster } from "@/types/course-insights";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";

function formatSessionRange(
  timeFrom: string,
  timeTo: string,
  format: ReturnType<typeof resolveTimeDisplayFormat>,
): string {
  return `${formatOverlapSessionTime(timeFrom, format)} – ${formatOverlapSessionTime(timeTo, format)}`;
}

function ClusterRow({ cluster }: { cluster: OverlapFixCluster }) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const removedSummary = cluster.removed_events
    .map((event) => formatSessionRange(event.time_from, event.time_to, timeFormat))
    .join(", ");

  return (
    <tr>
      <td className="whitespace-nowrap">{cluster.local_date}</td>
      <td>
        <div className="font-medium">
          Keep {formatSessionRange(cluster.survivor.time_from, cluster.survivor.time_to, timeFormat)}
        </div>
        <div className="text-xs text-muted-foreground">
          {cluster.survivor.marked_student_count} marked student
          {cluster.survivor.marked_student_count === 1 ? "" : "s"}
          {cluster.survivor.checkin_count > 0
            ? ` · ${cluster.survivor.checkin_count} check-in${cluster.survivor.checkin_count === 1 ? "" : "s"}`
            : ""}
        </div>
      </td>
      <td>
        <div>{removedSummary || "—"}</div>
        <div className="text-xs text-muted-foreground">
          {cluster.removed_events.length} session
          {cluster.removed_events.length === 1 ? "" : "s"} removed
        </div>
      </td>
      <td className="text-right tabular-nums">{cluster.users_merged_count}</td>
    </tr>
  );
}

export function OverlapFixPreviewSheet({
  courseId,
  courseTitle,
  courseCode,
  open,
  onOpenChange,
}: {
  courseId: number;
  courseTitle: string;
  courseCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  const previewQuery = useQuery({
    queryKey: ["overlapFixPreview", courseId],
    enabled: open,
    queryFn: () => fetchOverlapFixPreview(courseId),
  });

  const applyMutation = useMutation({
    mutationFn: () => applyOverlapFix(courseId),
    onSuccess: (response) => {
      const result = response.data;
      if (result.applied) {
        toast.add({
          title: "Overlapping sessions replaced",
          description: `Removed ${result.events_removed.length} duplicate session${result.events_removed.length === 1 ? "" : "s"} and merged ${result.users_merged_count} attendance row${result.users_merged_count === 1 ? "" : "s"}.`,
        });
      } else {
        toast.add({
          title: "Nothing to replace",
          description: "This course no longer has overlapping sessions.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["courseInsights"] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast.add({
        type: "error",
        title: "Could not replace",
        description: parseSchedjuiceApiError(error, "Try again or contact support."),
      });
    },
  });

  const preview = previewQuery.data?.data;
  const clusters = preview?.clusters ?? [];
  const rescheduleEventIds = useMemo(
    () =>
      clusters.flatMap((cluster) =>
        cluster.removed_events.map((event) => event.event_id)
      ),
    [clusters]
  );

  return (
    <>
      <Sheet.Root open={open} onOpenChange={onOpenChange}>
        <Sheet.Portal>
          <Sheet.Backdrop />
          <Sheet.Popup className="flex w-full flex-col sm:max-w-2xl">
            <div>
              <Sheet.Title>Overlapping sessions</Sheet.Title>
              <Sheet.Description>
                Fix reschedules conflicting sessions to a shared time. Replace
                merges duplicates and keeps attendance on the session with the
                most marked records.
              </Sheet.Description>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
              <div className="space-y-1">
                <Link
                  href={`/courses/${courseId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium hover:underline"
                >
                  {courseTitle}
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
                {courseCode ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {courseCode}
                  </p>
                ) : null}
              </div>

              {previewQuery.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : previewQuery.isError ? (
                <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive" role="alert">
                    {parseSchedjuiceApiError(
                      previewQuery.error,
                      "Failed to load preview."
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void previewQuery.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : !preview?.has_overlaps ? (
                <p className="rounded-xl border py-8 text-center text-sm text-muted-foreground">
                  No overlapping sessions found for this course.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Replace plan: {preview.summary.clusters_count} overlap group
                    {preview.summary.clusters_count === 1 ? "" : "s"} ·{" "}
                    {preview.summary.events_removed_count} session
                    {preview.summary.events_removed_count === 1 ? "" : "s"} to
                    remove · {preview.summary.users_merged_count} attendance row
                    {preview.summary.users_merged_count === 1 ? "" : "s"} to merge
                  </p>
                  <div className="overflow-x-auto rounded-xl border">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Keep</th>
                          <th>Remove</th>
                          <th className="text-right">Rows merged</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clusters.map((cluster) => (
                          <ClusterRow
                            key={
                              cluster.local_date + cluster.survivor.event_id
                            }
                            cluster={cluster}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    !preview?.has_overlaps ||
                    previewQuery.isLoading ||
                    rescheduleEventIds.length === 0
                  }
                  onClick={() => {
                    setRescheduleError(null);
                    setIsRescheduleOpen(true);
                  }}
                >
                  Fix
                </Button>
                <Button
                  type="button"
                  disabled={
                    !preview?.has_overlaps ||
                    previewQuery.isLoading ||
                    applyMutation.isPending
                  }
                  isLoading={applyMutation.isPending}
                  onClick={() => applyMutation.mutate()}
                >
                  Replace
                </Button>
              </div>
            </div>
          </Sheet.Popup>
        </Sheet.Portal>
      </Sheet.Root>

      <RescheduleConflictsDialog
        open={isRescheduleOpen}
        onOpenChange={setIsRescheduleOpen}
        conflictCount={rescheduleEventIds.length}
        primaryLabel="Apply"
        isSubmitting={isRescheduling}
        error={rescheduleError}
        onApply={async (times) => {
          setIsRescheduling(true);
          setRescheduleError(null);
          try {
            await applyOverlapReschedule(courseId, {
              event_ids: rescheduleEventIds,
              time_from: times.time_from,
              time_to: times.time_to,
            });
            toast.add({
              title: "Sessions rescheduled",
              description: `Updated ${rescheduleEventIds.length} session${rescheduleEventIds.length === 1 ? "" : "s"} to the new times. Attendance was left unchanged.`,
            });
            void queryClient.invalidateQueries({ queryKey: ["courseInsights"] });
            setIsRescheduleOpen(false);
            onOpenChange(false);
          } catch (error) {
            setRescheduleError(
              parseSchedjuiceApiError(
                error,
                "Those times still overlap or could not be saved."
              )
            );
          } finally {
            setIsRescheduling(false);
          }
        }}
      />
    </>
  );
}
