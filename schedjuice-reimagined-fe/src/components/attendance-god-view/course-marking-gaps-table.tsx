import { Badge } from "@/components/courses/ui/badge";
import { Button, buttonVariants } from "@/components/primitives";
import {
  getAttendanceGodViewStatusBadgeVariant,
  getCourseMarkingGapsEmptyMessage,
  getDominantProblemLabel,
} from "@/helpers/attendance-god-view";
import { formatDateRange } from "@/helpers/date";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
  courseOperationalTableShellClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";
import type {
  AttendanceGodViewCourseGapRow,
  AttendanceGodViewCourseGapSummary,
} from "@/types/attendance-god-view";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";

type Props = {
  rows: AttendanceGodViewCourseGapRow[];
  gapMinRate: string;
  problemStatus: string;
  stalledAfterMarking?: boolean;
  summary?: Pick<AttendanceGodViewCourseGapSummary, "has_scheduled_sessions"> | null;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onOpenDetail: (row: AttendanceGodViewCourseGapRow) => void;
};

export function CourseMarkingGapsTable({
  rows,
  gapMinRate,
  problemStatus,
  stalledAfterMarking = false,
  summary = null,
  hasActiveFilters = false,
  onClearFilters,
  onOpenDetail,
}: Props) {
  return (
    <div className={courseOperationalTableShellClassName()}>
      <table className={courseOperationalTableClassName()}>
      <thead>
        <tr className={courseOperationalTableHeadRowClassName()}>
          <th className={courseOperationalTableHeadCellClassName()}>Course</th>
          <th className={courseOperationalTableHeadCellClassName()}>Date</th>
          <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>Scheduled</th>
          <th className={courseOperationalTableHeadCellClassName()}>P / L / A / Unregistered</th>
          <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>Unregistered %</th>
          <th className={courseOperationalTableHeadCellClassName()}>Dominant problem</th>
          <th className={courseOperationalTableHeadCellClassName()} />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={7} className={cn(courseOperationalTableBodyCellClassName(), "text-center text-text-muted")}>
              <div className="space-y-2 py-2">
                <p>
                  {getCourseMarkingGapsEmptyMessage(
                    gapMinRate,
                    problemStatus,
                    summary,
                    { stalledAfterMarking },
                  )}
                </p>
                {hasActiveFilters && onClearFilters ? (
                  <Button variant="ghost" size="sm" onClick={onClearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={`${row.course_id}-${row.event_date_from}-${row.event_date_to}`}>
              <td className={courseOperationalTableBodyCellClassName()}>
                <div className="font-medium">{row.course_title}</div>
                <div className="text-xs text-text-muted">
                  {row.course_code || row.category_name || row.program_name}
                </div>
              </td>
              <td className={courseOperationalTableBodyCellClassName()}>
                {formatDateRange(row.event_date_from, row.event_date_to)}
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "text-right tabular-nums")}>
                {row.scheduled_count}
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "tabular-nums text-sm")}>
                {row.present_count} / {row.late_count} / {row.absent_count} /{" "}
                {row.unregistered_count}
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "text-right tabular-nums font-semibold")}>
                {row.unregistered_rate}%
              </td>
              <td className={courseOperationalTableBodyCellClassName()}>
                <Badge
                  variant={getAttendanceGodViewStatusBadgeVariant(
                    row.dominant_problem,
                  )}
                >
                  {getDominantProblemLabel(row.dominant_problem)}
                </Badge>
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
                    href={`/courses/${row.course_id}/attendance`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "h-8 w-8 p-0",
                    )}
                    aria-label="Open course attendance"
                  >
                    <ExternalLink className="h-4 w-4" />
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
