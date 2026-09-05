export enum SubmissionTrackerAssessmentKind {
  Assignment = "assignment",
  Quiz = "quiz",
}

export enum SubmissionTrackerSort {
  MissedCountDesc = "missed_count_desc",
  MissedCountAsc = "missed_count_asc",
  StudentName = "student_name",
  CourseTitle = "course_title",
}

export type SubmissionTrackerSummary = {
  at_risk_pairs: number;
  students_flagged: number;
  courses_affected: number;
};

export type SubmissionTrackerRow = {
  student_id: number;
  student_name: string;
  student_email: string;
  course_id: number;
  course_title: string;
  course_status: string;
  missed_count: number;
  missed_assignments_count: number;
  missed_quizzes_count: number;
  is_at_risk: boolean;
};

export type SubmissionTrackerDetailItem = {
  kind: SubmissionTrackerAssessmentKind;
  assessment_id: number;
  title: string;
  deadline: string | null;
};

export type SubmissionTrackerSearchBody = {
  date_from: string;
  date_to: string;
  course_id?: string;
  student_id?: string;
  active_courses_only?: boolean;
  show_all?: boolean;
  min_missed_count?: number;
  sort?: string;
};

export type SubmissionTrackerSearchResponse = {
  data?: {
    summary: SubmissionTrackerSummary;
    results: SubmissionTrackerRow[];
  };
  page?: number;
  size?: number;
  count?: number;
};

export type SubmissionTrackerDetailResponse = {
  data?: {
    items: SubmissionTrackerDetailItem[];
  };
};
