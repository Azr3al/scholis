import { Button, buttonVariants } from "@/components/primitives";
import { attendanceRateBadgeClass } from "@/helpers/attendance-god-view";
import type { AttendanceGodViewRow } from "@/types/attendance-god-view";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
  courseOperationalTableShellClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";

type Props = {
  rows: AttendanceGodViewRow[];
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onOpenDetail: (row: AttendanceGodViewRow) => void;
};

export function RiskOverviewTable({
  rows,
  hasActiveFilters = false,
  onClearFilters,
  onOpenDetail,
}: Props) {
  return (
    <div className={courseOperationalTableShellClassName()}>
      <table className={courseOperationalTableClassName()}>
      <thead>
        <tr className={courseOperationalTableHeadRowClassName()}>
          <th className={courseOperationalTableHeadCellClassName()}>Student</th>
          <th className={courseOperationalTableHeadCellClassName()}>Course</th>
          <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>Rate</th>
          <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>P / L / A</th>
          <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>Unregistered</th>
          <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>Streak</th>
          <th className={courseOperationalTableHeadCellClassName()}>Last attended</th>
          <th className={courseOperationalTableHeadCellClassName()} />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={8} className={cn(courseOperationalTableBodyCellClassName(), "text-center text-text-muted")}>
              <div className="space-y-2 py-2">
                <p>No student-course pairs match these filters.</p>
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
            <tr key={`${row.student_id}-${row.course_id}`}>
              <td className={courseOperationalTableBodyCellClassName()}>
                <div className="font-medium">{row.student_name}</div>
                <div className="text-xs text-text-muted">
                  {row.student_email}
                </div>
                {row.is_at_risk && (
                  <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("mt-1 ml-1")}>
                    At risk
                  </span>
                )}
              </td>
              <td className={courseOperationalTableBodyCellClassName()}>
                <div>{row.course_title}</div>
                <div className="text-xs text-text-muted">
                  {row.category_name}
                </div>
              </td>
              <td
                className={cn(courseOperationalTableBodyCellClassName(), "text-right tabular-nums", attendanceRateBadgeClass(row.attendance_rate))}
              >
                {row.attendance_rate}%
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "text-right tabular-nums text-sm")}>
                {row.present_count} / {row.late_count} / {row.absent_count}
                <span className="text-text-muted">
                  {" "}
                  ({row.scheduled_classes})
                </span>
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "text-right tabular-nums")}>
                {row.unregistered_count}
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "text-right tabular-nums")}>
                {row.recent_absence_streak}
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "text-sm")}>
                {row.last_attended_date ?? "-"}
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
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
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
