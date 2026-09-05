export const COURSE_INSIGHTS_ISSUES = [
  "no_schedule",
  "overlapping_events",
  "no_students",
  "no_main_teacher",
  "no_assistant_teacher",
  "missing_session_data",
] as const;

export type CourseInsightsIssue = (typeof COURSE_INSIGHTS_ISSUES)[number];

export type CourseInsightsSearchBody = {
  issues?: CourseInsightsIssue[];
  category_id?: number;
  program_id?: number;
  intake_id?: number;
  q?: string;
  page?: number;
  size?: number;
};

export type CourseInsightsRow = {
  course_id: number;
  course_title: string;
  course_code: string;
  category_id: number | null;
  category_name: string;
  program_id: number | null;
  program_name: string;
  issues: CourseInsightsIssue[];
  missing_session_data_count: number;
};

export type CourseInsightsSummary = {
  total_active_courses: number;
  faulty_courses: number;
  issue_counts: Record<CourseInsightsIssue, number>;
};

export type CourseInsightsSearchResponse = {
  data: {
    summary: CourseInsightsSummary;
    results: CourseInsightsRow[];
  };
  page: number;
  size: number;
  count: number;
};

export type OverlapFixEventSummary = {
  event_id: number;
  time_from: string;
  time_to: string;
  marked_student_count: number;
  checkin_count: number;
};

export type OverlapFixCluster = {
  local_date: string;
  survivor: OverlapFixEventSummary;
  removed_events: OverlapFixEventSummary[];
  users_merged_count: number;
  daily_note_moved: boolean;
};

export type OverlapFixPreviewResponse = {
  data: {
    course_id: number;
    course_title: string;
    has_overlaps: boolean;
    clusters: OverlapFixCluster[];
    summary: {
      clusters_count: number;
      events_removed_count: number;
      users_merged_count: number;
    };
  };
};

export type OverlapFixApplyResponse = {
  data: {
    applied: boolean;
    clusters_fixed: number;
    events_removed: number[];
    events_kept: number[];
    users_merged_count: number;
  };
};

export type OverlapReschedulePreviewResponse = {
  data: {
    course_id: number;
    course_title: string;
    has_overlaps: boolean;
    clusters: Array<{
      local_date: string;
      events: Array<{ id: number; time_from: string; time_to: string }>;
    }>;
    summary: {
      clusters_count: number;
      events_count: number;
    };
  };
};

export type OverlapRescheduleApplyResponse = {
  data: {
    applied: boolean;
    updated_event_ids: number[];
    time_from: string;
    time_to: string;
  };
};
