"use client";
import { Badge } from "@/components/courses/ui/badge";
import { Button, Sheet, buttonVariants } from "@/components/primitives";

import { TableSkeleton } from "@/components/loading/structured-skeletons";
import {
  getAttendanceGodViewStatusBadgeVariant,
  getAttendanceGodViewStatusLabel,
} from "@/helpers/attendance-god-view";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import type {
  AttendanceGodViewDailyRow,
  AttendanceGodViewDetailRecord,
  AttendanceGodViewMode,
  AttendanceGodViewMonthlyDetailResponse,
  AttendanceGodViewMonthlyRow,
  AttendanceGodViewRow,
} from "@/types/attendance-god-view";
import { format } from "date-fns";
import { Download } from "iconoir-react";
import Link from "next/link";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: AttendanceGodViewMode;
  title: string;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  courseDetailRecords?: AttendanceGodViewDetailRecord[];
  monthlyDetail?: AttendanceGodViewMonthlyDetailResponse;
  onExport?: () => void;
  exportPending?: boolean;
  selectedDailyRow?: AttendanceGodViewDailyRow | null;
  selectedRiskRow?: AttendanceGodViewRow | null;
  selectedMonthlyRow?: AttendanceGodViewMonthlyRow | null;
};

export function AttendanceGodViewDetailSheet({
  open,
  onClose,
  mode,
  title,
  isLoading,
  isError,
  error,
  courseDetailRecords,
  monthlyDetail,
  onExport,
  exportPending,
  selectedDailyRow,
  selectedRiskRow,
  selectedMonthlyRow,
}: Props) {
  const contactRow =
    selectedDailyRow ?? selectedMonthlyRow ?? selectedRiskRow ?? null;

  return (
    <Sheet.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="w-full sm:max-w-xl overflow-y-auto">
        <div>
          <Sheet.Title>{title}</Sheet.Title>
        </div>

        {contactRow && (
          <div className="mt-4 space-y-1 text-sm">
            {"student_email" in contactRow && contactRow.student_email && (
              <p>{contactRow.student_email}</p>
            )}
            {"student_phone" in contactRow && contactRow.student_phone && (
              <p>{contactRow.student_phone}</p>
            )}
            <Link
                href={`/users/${contactRow.student_id}`}
                className={cn(buttonVariants({ variant: "ghost" }), "h-auto p-0")}
              >
                Open student profile
              </Link>
          </div>
        )}

        {onExport && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary" size="sm"
              disabled={exportPending}
              onClick={onExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export detail CSV
            </Button>
          </div>
        )}

        {isLoading ? (
          <TableSkeleton className="mt-4" columns={3} rows={5} />
        ) : isError ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {parseSchedjuiceApiError(error, "Failed to load attendance details.")}
          </p>
        ) : mode === "monthly_students" && monthlyDetail ? (
          <div className="mt-4 space-y-6">
            {monthlyDetail.course_records.map((group) => (
              <div key={group.course_id}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-medium">{group.course_title}</h3>
                  <Link
                    href={`/courses/${group.course_id}/attendance`}
                    className={cn(buttonVariants({ variant: "ghost" }), "h-auto p-0")}
                  >
                    Open course attendance
                  </Link>
                </div>
                <table className={courseOperationalTableClassName()}>
                  <thead>
                    <tr className={courseOperationalTableHeadRowClassName()}>
                      <th className={courseOperationalTableHeadCellClassName()}>Date</th>
                      <th className={courseOperationalTableHeadCellClassName()}>Status</th>
                      <th className={courseOperationalTableHeadCellClassName()}>Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((rec) => (
                      <tr key={rec.event_id}>
                        <td className={cn(courseOperationalTableBodyCellClassName(), "text-sm whitespace-nowrap")}>
                          {rec.event_date
                            ? format(new Date(rec.event_date), "MMM d, yyyy")
                            : "-"}
                        </td>
                        <td className={courseOperationalTableBodyCellClassName()}>
                          <Badge
                            variant={getAttendanceGodViewStatusBadgeVariant(
                              rec.attendance_status,
                            )}
                          >
                            {getAttendanceGodViewStatusLabel(rec.attendance_status)}
                          </Badge>
                        </td>
                        <td className={cn(courseOperationalTableBodyCellClassName(), "text-sm")}>
                          {rec.event_title}
                          {rec.attendance_note && (
                            <p className="text-xs text-text-muted mt-1">
                              {rec.attendance_note}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <table className={cn(courseOperationalTableClassName(), "mt-4")}>
            <thead>
              <tr className={courseOperationalTableHeadRowClassName()}>
                <th className={courseOperationalTableHeadCellClassName()}>Date</th>
                <th className={courseOperationalTableHeadCellClassName()}>Status</th>
                <th className={courseOperationalTableHeadCellClassName()}>Session</th>
              </tr>
            </thead>
            <tbody>
              {(courseDetailRecords ?? []).map((rec) => (
                <tr key={rec.event_id}>
                  <td className={cn(courseOperationalTableBodyCellClassName(), "text-sm whitespace-nowrap")}>
                    {rec.event_date
                      ? format(new Date(rec.event_date), "MMM d, yyyy")
                      : "-"}
                  </td>
                  <td className={courseOperationalTableBodyCellClassName()}>
                    <Badge
                      variant={getAttendanceGodViewStatusBadgeVariant(
                        rec.attendance_status,
                      )}
                    >
                      {getAttendanceGodViewStatusLabel(rec.attendance_status)}
                    </Badge>
                  </td>
                  <td className={cn(courseOperationalTableBodyCellClassName(), "text-sm")}>
                    {rec.event_title}
                    {rec.attendance_note && (
                      <p className="text-xs text-text-muted mt-1">
                        {rec.attendance_note}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
