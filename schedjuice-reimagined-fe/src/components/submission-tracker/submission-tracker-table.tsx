import { Button, buttonVariants } from "@/components/primitives";
import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
  courseOperationalTableShellClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { courseStatus } from "@/types/course";
import type { SubmissionTrackerRow } from "@/types/submission-tracker";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  rows: SubmissionTrackerRow[];
  onOpenDetail: (row: SubmissionTrackerRow) => void;
};

const COURSE_STATUS_LABELS: Record<courseStatus, string> = {
  [courseStatus.active]: "Active",
  [courseStatus.ended]: "Ended",
  [courseStatus.paused]: "Paused",
  [courseStatus.planned]: "Planned",
};

export function SubmissionTrackerTable({ rows, onOpenDetail }: Props) {
  return (
    <div className={courseOperationalTableShellClassName()}>
      <table className={courseOperationalTableClassName()}>
        <thead>
          <tr className={courseOperationalTableHeadRowClassName()}>
            <th className={courseOperationalTableHeadCellClassName()}>Student</th>
            <th className={courseOperationalTableHeadCellClassName()}>Course</th>
            <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>
              Missed
            </th>
            <th className={courseOperationalTableHeadCellClassName()}>Status</th>
            <th className={courseOperationalTableHeadCellClassName()} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className={cn(
                  courseOperationalTableBodyCellClassName(),
                  "text-center text-muted-foreground",
                )}
              >
                No students match these filters.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.student_id}-${row.course_id}`}>
                <td className={courseOperationalTableBodyCellClassName()}>
                  <div className="font-medium">{row.student_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {maskEmailLocalPart(row.student_email)}
                  </div>
                </td>
                <td className={courseOperationalTableBodyCellClassName()}>
                  <div>{row.course_title}</div>
                  <div className="text-xs text-muted-foreground">
                    {COURSE_STATUS_LABELS[row.course_status as courseStatus] ??
                      row.course_status}
                  </div>
                </td>
                <td
                  className={cn(
                    courseOperationalTableBodyCellClassName(),
                    "text-right tabular-nums",
                    row.is_at_risk ? "font-semibold text-destructive" : "",
                  )}
                >
                  {row.missed_count}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {row.missed_assignments_count} assignments ·{" "}
                    {row.missed_quizzes_count} quizzes
                  </span>
                </td>
                <td className={courseOperationalTableBodyCellClassName()}>
                  {row.is_at_risk ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                      Needs follow-up
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                      Below threshold
                    </span>
                  )}
                </td>
                <td className={courseOperationalTableBodyCellClassName()}>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenDetail(row)}
                    >
                      Details
                    </Button>
                    <Link
                      href={`/courses/${row.course_id}/assessments`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="sr-only">Open course assessments</span>
                    </Link>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
