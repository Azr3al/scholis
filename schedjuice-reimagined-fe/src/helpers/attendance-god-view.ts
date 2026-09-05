import { ATTENDANCE_STATUS_OPTIONS } from "@/components/attendance/attendance-status-config";
import { attendanceStatus } from "@/types/attendance";
import type {
  AttendanceGodViewCourseGapSummary,
  AttendanceGodViewDailySummary,
  AttendanceGodViewMode,
} from "@/types/attendance-god-view";
import {
  CourseMarkingProblemStatus,
  DailyAttendanceStatusFilter,
} from "@/types/attendance-god-view";
import { accountType, role } from "@/types/user";

const STATUS_LABEL_BY_VALUE = Object.fromEntries(
  ATTENDANCE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>;

const NO_COURSE_SESSIONS_MESSAGE_DAILY =
  "This course has no scheduled sessions on this day.";

const NO_COURSE_SESSIONS_MESSAGE_GAPS =
  "This course has no scheduled sessions in the selected range.";

export type GodViewOptionalFilterParams = {
  courseId: string;
  categoryIdsActive: boolean;
  programId: string;
  studentId: string;
  minRate: string;
  maxRate: string;
  sort: string;
  gapMinRate: string;
  problemStatus: string;
  stalledAfterMarking: boolean;
};

export const DAILY_STATUS_FILTER_CARD_CONFIG: {
  filter: DailyAttendanceStatusFilter;
  countKey: keyof Pick<
    AttendanceGodViewDailySummary,
    "present_count" | "late_count" | "absent_count" | "unregistered_count"
  >;
}[] = [
  { filter: DailyAttendanceStatusFilter.Present, countKey: "present_count" },
  { filter: DailyAttendanceStatusFilter.Late, countKey: "late_count" },
  { filter: DailyAttendanceStatusFilter.Absent, countKey: "absent_count" },
  {
    filter: DailyAttendanceStatusFilter.Unregistered,
    countKey: "unregistered_count",
  },
];

export function canAccessAttendanceGodView(user: accountType | null | undefined) {
  if (!user?.roles?.length) return false;
  const allowed = [role.superadmin, role.admin, role.hr];
  return allowed.some((r) => user.roles?.includes(r));
}

export function attendanceRateBadgeClass(rate: number) {
  if (rate < 60) return "text-destructive font-semibold";
  if (rate < 75) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "text-foreground";
}

export function getAttendanceGodViewStatusLabel(status: string): string {
  return STATUS_LABEL_BY_VALUE[status] ?? status;
}

export function getDominantProblemLabel(problem: string): string {
  return getAttendanceGodViewStatusLabel(problem);
}

export function godViewDateRangeFilenameSuffix(from: string, to: string): string {
  if (from === to) return from;
  return `${from}_to_${to}`;
}

export function hasActiveOptionalFilters(
  mode: AttendanceGodViewMode,
  params: GodViewOptionalFilterParams,
): boolean {
  const shared =
    params.courseId !== "" ||
    params.categoryIdsActive ||
    params.programId !== "";

  if (shared) return true;

  if (mode === "risk") {
    return (
      params.studentId !== "" ||
      params.minRate !== "" ||
      params.maxRate !== "" ||
      params.sort !== "attendance_rate_asc"
    );
  }

  if (mode === "course_marking_gaps") {
    if (params.stalledAfterMarking) return true;
    return (
      params.gapMinRate !== "80" ||
      params.problemStatus !== CourseMarkingProblemStatus.Unregistered
    );
  }

  return false;
}

export function getCourseMarkingGapsEmptyMessage(
  gapMinRate: string,
  problemStatus: string,
  summary?: Pick<AttendanceGodViewCourseGapSummary, "has_scheduled_sessions"> | null,
  options?: { stalledAfterMarking?: boolean },
): string {
  if (summary?.has_scheduled_sessions === false) {
    return NO_COURSE_SESSIONS_MESSAGE_GAPS;
  }
  if (options?.stalledAfterMarking) {
    return "No courses with prior marking and two consecutive unregistered session days in the selected range.";
  }
  if (gapMinRate) {
    return `No courses exceed ${gapMinRate}% for the selected problem type in the selected range.`;
  }
  return "No scheduled attendance in the selected range.";
}

export const COURSE_MARKING_PROBLEM_STATUS_OPTIONS: {
  value: CourseMarkingProblemStatus;
  label: string;
}[] = [
  { value: CourseMarkingProblemStatus.Unregistered, label: "Unregistered" },
  { value: CourseMarkingProblemStatus.Absent, label: "Absent" },
  { value: CourseMarkingProblemStatus.Late, label: "Late" },
  { value: CourseMarkingProblemStatus.Present, label: "Present" },
  { value: CourseMarkingProblemStatus.All, label: "All problems" },
];

export function getAttendanceGodViewStatusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === DailyAttendanceStatusFilter.Present) return "default";
  if (status === DailyAttendanceStatusFilter.Late) return "secondary";
  if (status === DailyAttendanceStatusFilter.Absent) return "destructive";
  if (status === attendanceStatus.absentWithLeave) return "secondary";
  return "outline";
}

export function getDailyAbsencesEmptyMessage(
  statusFilter: DailyAttendanceStatusFilter | null | undefined,
  summary?: Pick<AttendanceGodViewDailySummary, "has_scheduled_sessions"> | null,
): string {
  if (summary?.has_scheduled_sessions === false) {
    return NO_COURSE_SESSIONS_MESSAGE_DAILY;
  }
  if (!statusFilter) {
    return "No attendance records for this day.";
  }
  return `No ${getAttendanceGodViewStatusLabel(statusFilter).toLowerCase()} students for this day.`;
}
