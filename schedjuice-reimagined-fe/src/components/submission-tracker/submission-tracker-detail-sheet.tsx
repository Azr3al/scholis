"use client";
import { Button, Sheet, buttonVariants } from "@/components/primitives";

import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { formatDateTime } from "@/helpers/date";
import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { submissionTrackerAssessmentHref } from "@/helpers/submission-tracker";
import {
  SubmissionTrackerAssessmentKind,
  type SubmissionTrackerDetailItem,
  type SubmissionTrackerRow,
} from "@/types/submission-tracker";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  row: SubmissionTrackerRow | null;
  items: SubmissionTrackerDetailItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

function kindLabel(kind: SubmissionTrackerAssessmentKind) {
  return kind === SubmissionTrackerAssessmentKind.Quiz ? "Quiz" : "Assignment";
}

export function SubmissionTrackerDetailSheet({
  open,
  onClose,
  row,
  items,
  isLoading,
  isError,
  error,
}: Props) {
  return (
    <Sheet.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="w-full overflow-y-auto sm:max-w-xl">
        <div>
          <Sheet.Title>
            {row
              ? `${row.student_name} — ${row.course_title}`
              : "Missed assessments"}
          </Sheet.Title>
        </div>

        {row && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-muted-foreground">
              {maskEmailLocalPart(row.student_email)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/users/${row.student_id}`}
                className={cn(buttonVariants({ variant: "ghost" }), "h-auto p-0")}
              >
                Open student profile
              </Link>
              <Link
                href={`/courses/${row.course_id}/assessments`}
                className={cn(buttonVariants({ variant: "ghost" }), "h-auto p-0")}
              >
                Open course assessments
              </Link>
            </div>
          </div>
        )}

        <div className="mt-6" aria-busy={isLoading}>
          {isLoading ? (
            <TableSkeleton columns={4} rows={5} />
          ) : isError ? (
            <p className="text-destructive text-sm" role="alert">
              {parseSchedjuiceApiError(error)}
            </p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No missed assessments in this date range.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Type</th>
                  <th>Deadline</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.kind}-${item.assessment_id}`}>
                    <td className="font-medium">{item.title}</td>
                    <td>
                      <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" >{kindLabel(item.kind)}</span>
                    </td>
                    <td className="text-sm">
                      {item.deadline
                        ? formatDateTime(item.deadline)
                        : "—"}
                    </td>
                    <td>
                      <Link
                        href={submissionTrackerAssessmentHref(
                          item.kind,
                          item.assessment_id,
                        )}
                        className="text-primary text-sm font-medium hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
