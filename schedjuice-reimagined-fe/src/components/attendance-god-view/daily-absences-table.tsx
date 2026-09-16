import { Badge } from "@/components/courses/ui/badge";
import { Button, buttonVariants } from "@/components/primitives";
import {
  getAttendanceGodViewStatusBadgeVariant,
  getAttendanceGodViewStatusLabel,
  getDailyAbsencesEmptyMessage,
} from "@/helpers/attendance-god-view";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
  courseOperationalTableShellClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";
import type {
  AttendanceGodViewDailyRow,
  AttendanceGodViewDailySummary,
  DailyAttendanceStatusFilter,
} from "@/types/attendance-god-view";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";

type Props = {
  rows: AttendanceGodViewDailyRow[];
  statusFilter?: DailyAttendanceStatusFilter | null;
  summary?: Pick<AttendanceGodViewDailySummary, "has_scheduled_sessions"> | null;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onOpenDetail: (row: AttendanceGodViewDailyRow) => void;
};

export function DailyAbsencesTable({
  rows,
  statusFilter = null,
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
          <th className={courseOperationalTableHeadCellClassName()}>Student</th>
          <th className={courseOperationalTableHeadCellClassName()}>Course</th>
          <th className={courseOperationalTableHeadCellClassName()}>Session</th>
          <th className={courseOperationalTableHeadCellClassName()}>Status</th>
          <th className={cn(courseOperationalTableHeadCellClassName(), "text-right")}>Streak</th>
          <th className={courseOperationalTableHeadCellClassName()}>Last attended</th>
          <th className={courseOperationalTableHeadCellClassName()} />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={7} className={cn(courseOperationalTableBodyCellClassName(), "text-center text-text-muted")}>
              <div className="space-y-2 py-2">
                <p>{getDailyAbsencesEmptyMessage(statusFilter, summary)}</p>
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
            <tr key={`${row.student_id}-${row.course_id}-${row.event_id}`}>
              <td className={courseOperationalTableBodyCellClassName()}>
                <div className="font-medium">{row.student_name}</div>
                <div className="text-xs text-text-muted">
                  {row.student_email}
                </div>
                {row.student_phone && (
                  <div className="text-xs text-text-muted">
                    {row.student_phone}
                  </div>
                )}
              </td>
              <td className={courseOperationalTableBodyCellClassName()}>
                <div>{row.course_title}</div>
                <div className="text-xs text-text-muted">
                  {row.category_name || row.program_name}
                </div>
              </td>
              <td className={courseOperationalTableBodyCellClassName()}>
                <div>{row.event_title}</div>
                <div className="text-xs text-text-muted">
                  {row.time_from} - {row.time_to}
                </div>
              </td>
              <td className={courseOperationalTableBodyCellClassName()}>
                <Badge
                  variant={getAttendanceGodViewStatusBadgeVariant(
                    row.attendance_status,
                  )}
                >
                  {getAttendanceGodViewStatusLabel(row.attendance_status)}
                </Badge>
              </td>
              <td className={cn(courseOperationalTableBodyCellClassName(), "text-right tabular-nums")}>
                {row.recent_absence_streak}
              </td>
              <td className={courseOperationalTableBodyCellClassName()}>
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
