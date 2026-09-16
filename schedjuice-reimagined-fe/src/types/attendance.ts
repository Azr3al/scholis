// src/types/attendance.ts
import * as z from "zod";
import { accountSchema } from "./user";
import { eventSchema } from "./course";

export enum attendanceStatus {
  unregistered = "unregistered",
  present = "present",
  absent = "absent",
  absentWithLeave = "absent_with_leave",
  late = "late",
}

export enum CheckinStatus {
  not_checked_in = "not_checked_in",
  checked_in = "checked_in",
  checked_out = "checked_out",
}

export type CheckinBlockReason =
  | "checkin_too_early"
  | "checkin_after_event_end"
  | "payroll_rate_missing";

export type UserCheckinCurrentEvent = {
  event?: {
    id?: number;
    title?: string | null;
    time_from?: string;
    time_to?: string;
  };
};

export type OpenCheckinSession = {
  course_id: number;
  course_title: string;
  course_effective_status?: string;
  user_event: UserCheckinCurrentEvent;
  has_stale_open_session?: boolean;
};

export type UserCheckinStatus = {
  has_events_today: boolean;
  checkin_status: CheckinStatus;
  can_check_in: boolean;
  can_check_out: boolean;
  current_event?: UserCheckinCurrentEvent;
  open_checkin_session?: OpenCheckinSession | null;
  has_stale_open_session?: boolean;
  total_events?: number;
  completed_events?: number;
  checkin_opens_at?: string | null;
  checkin_closes_at?: string | null;
  checkin_block_reason?: CheckinBlockReason | null;
  checkin_block_message?: string | null;
};

export const attendanceSchema = z.object({
  id: z.number(),
  user: accountSchema,
  event: eventSchema,
  attendance_status: z.nativeEnum(attendanceStatus),
  attendance_note: z.string().nullable().optional(),
  checkin_time: z.string().nullable().optional(),
  checkout_time: z.string().nullable().optional(),
  checkin_image: z.string().nullable().optional(),
  is_extra_class: z.boolean(),
  today_activities: z.string().nullable().optional(),
});

export type attendanceType = z.infer<typeof attendanceSchema>;

export type MarkingRosterUser = {
  id: number;
  name: string;
  alternative_name: string | null;
  phone_number: string | null;
};

export type MarkingRosterRow = {
  id: number;
  attendance_status: attendanceStatus;
  attendance_note: string | null;
  is_removed: boolean;
  event_id: number;
  user: MarkingRosterUser;
};

export type AttendanceMarkingBootstrap = {
  course: {
    id: number;
    title: string;
    start_date: string;
    end_date: string;
  };
  events: Array<{
    id: number;
    date: string;
    date_ymd?: string;
    time_from: string;
    time_to: string;
    title: string | null;
  }>;
  preferred_event_id: number | null;
  active_event_id: number | null;
  tenant_timezone?: string;
  today_ymd?: string;
  roster: MarkingRosterRow[];
};

export type AttendanceCountSummary = {
  attended: number;
  total: number;
  pct: number;
};

export type CourseAttendanceSummaryMonth = {
  anchor: string;
  label: string;
  session_count: number;
};

export type CourseAttendanceSummaryStudent = {
  id: number;
  name: string;
  is_removed: boolean;
  by_month: Record<string, AttendanceCountSummary>;
  course: AttendanceCountSummary;
};

export type CourseAttendanceSummary = {
  months: CourseAttendanceSummaryMonth[];
  students: CourseAttendanceSummaryStudent[];
  class_aggregate: {
    by_month: Record<string, AttendanceCountSummary>;
    course: AttendanceCountSummary;
  };
};
