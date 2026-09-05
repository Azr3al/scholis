import { attendanceStatus } from "@/types/attendance";

export type AttendanceGodViewMode =
  | "daily_absences"
  | "course_marking_gaps"
  | "monthly_students"
  | "risk";

export enum CourseMarkingProblemStatus {
  Unregistered = "unregistered",
  Absent = "absent",
  Late = "late",
  Present = "present",
  All = "all",
}

export enum DailyAttendanceStatusFilter {
  Present = attendanceStatus.present,
  Late = attendanceStatus.late,
  Absent = attendanceStatus.absent,
  Unregistered = attendanceStatus.unregistered,
}

export type AttendanceGodViewSummary = {
  average_attendance_rate: number;
  at_risk_count: number;
  absent_last_7_days_total: number;
  late_heavy_count: number;
  total_student_course_pairs: number;
  date_from: string;
  date_to: string;
  at_risk_threshold: number;
};

export type AttendanceGodViewDailySummary = {
  present_count: number;
  late_count: number;
  absent_count: number;
  unregistered_count: number;
  courses_affected_count: number;
  students_with_streaks_count: number;
  date_from: string;
  date_to: string;
  has_scheduled_sessions?: boolean | null;
};

export type AttendanceGodViewCourseGapSummary = {
  courses_affected_count: number;
  unregistered_slots_count: number;
  worst_course: {
    course_id: number;
    course_title: string;
    unregistered_rate: number;
  } | null;
  date_from: string;
  date_to: string;
  has_scheduled_sessions?: boolean | null;
};

export type AttendanceGodViewCourseGapRow = {
  course_id: number;
  course_title: string;
  course_code: string;
  category_id: number | null;
  category_name: string;
  program_id: number | null;
  program_name: string;
  event_date_from: string;
  event_date_to: string;
  scheduled_count: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  unregistered_count: number;
  unregistered_rate: number;
  dominant_problem: string;
};

export type AttendanceGodViewWorstCourse = {
  course_id: number;
  course_title: string;
  attendance_rate: number;
  absent_count: number;
};

export type AttendanceGodViewMonthlySummary = {
  students_at_risk_count: number;
  total_absences: number;
  unregistered_count: number;
  worst_course: AttendanceGodViewWorstCourse | null;
  date_from: string;
  date_to: string;
  at_risk_threshold: number;
};

export type AttendanceGodViewRow = {
  student_id: number;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_id: number;
  course_title: string;
  course_code: string;
  category_id: number;
  category_name: string;
  program_id: number;
  program_name: string;
  attendance_rate: number;
  absence_rate: number;
  late_rate: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  unregistered_count: number;
  scheduled_classes: number;
  recent_absence_streak: number;
  last_attended_date: string | null;
  last_class_status: string | null;
  absent_last_7_days: number;
  is_at_risk: boolean;
  is_late_heavy: boolean;
};

export type AttendanceGodViewDailyRow = {
  student_id: number;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_id: number;
  course_title: string;
  course_code: string;
  category_id: number | null;
  category_name: string;
  program_id: number | null;
  program_name: string;
  event_id: number;
  event_title: string;
  event_date: string | null;
  time_from: string;
  time_to: string;
  attendance_status: string;
  attendance_note: string | null;
  recent_absence_streak: number;
  last_attended_date: string | null;
};

export type AttendanceGodViewMonthlyRow = {
  student_id: number;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_count: number;
  scheduled_classes: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  unregistered_count: number;
  attendance_rate: number;
  absence_rate: number;
  late_rate: number;
  worst_course: AttendanceGodViewWorstCourse | null;
  recent_absence_streak: number;
  last_attended_date: string | null;
  is_at_risk: boolean;
  is_late_heavy: boolean;
  has_unregistered: boolean;
};

export type AttendanceGodViewSearchBody = {
  mode?: AttendanceGodViewMode;
  date_from?: string;
  date_to?: string;
  course_id?: number | string;
  student_id?: number | string;
  category_id?: number | string;
  category_ids?: number[];
  program_id?: number | string;
  intake_id?: number | string;
  level_id?: number | string;
  section_id?: number | string;
  campus_id?: number | string;
  min_attendance_rate?: number | string;
  max_attendance_rate?: number | string;
  at_risk_threshold?: number;
  sort?: string;
  daily_status_filter?: DailyAttendanceStatusFilter;
  problem_status?: CourseMarkingProblemStatus;
  min_rate?: number | string | null;
  stalled_after_marking?: boolean;
};

export type AttendanceGodViewSearchResponse = {
  isError: boolean;
  message: string;
  data: {
    summary: AttendanceGodViewSummary;
    results: AttendanceGodViewRow[];
  };
  page: number;
  size: number;
  count: number;
};

export type AttendanceGodViewDailySearchResponse = {
  isError: boolean;
  message: string;
  data: {
    summary: AttendanceGodViewDailySummary;
    results: AttendanceGodViewDailyRow[];
  };
  page: number;
  size: number;
  count: number;
};

export type AttendanceGodViewCourseGapSearchResponse = {
  isError: boolean;
  message: string;
  data: {
    summary: AttendanceGodViewCourseGapSummary;
    results: AttendanceGodViewCourseGapRow[];
  };
  page: number;
  size: number;
  count: number;
};

export type AttendanceGodViewCourseGapDetailResponse = {
  course_id: number;
  date_from: string;
  date_to: string;
  problem_status: CourseMarkingProblemStatus;
  records: AttendanceGodViewDailyRow[];
};

export type AttendanceGodViewMonthlySearchResponse = {
  isError: boolean;
  message: string;
  data: {
    summary: AttendanceGodViewMonthlySummary;
    results: AttendanceGodViewMonthlyRow[];
  };
  page: number;
  size: number;
  count: number;
};

export type AttendanceGodViewDetailRecord = {
  event_id: number;
  event_title: string;
  event_date: string | null;
  time_from: string;
  time_to: string;
  attendance_status: string;
  attendance_note: string | null;
  checkin_time: string | null;
  checkout_time: string | null;
  is_extra_class: boolean;
};

export type AttendanceGodViewDetailResponse = {
  isError: boolean;
  message: string;
  data: {
    student_id: number;
    course_id: number;
    date_from: string;
    date_to: string;
    records: AttendanceGodViewDetailRecord[];
  };
};

export type AttendanceGodViewMonthlyDetailResponse = {
  student_id: number;
  date_from: string;
  date_to: string;
  course_breakdown: AttendanceGodViewRow[];
  course_records: {
    course_id: number;
    course_title: string;
    records: AttendanceGodViewDetailRecord[];
  }[];
};
