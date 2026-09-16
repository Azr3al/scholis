export type AnalyticsTimeSeriesRow = {
  date: string;
  course_starts: number;
  course_ends: number;
  verified_payments: number;
  student_enrollments: number;
  removals: number;
};

export type AnalyticsTimeSeriesApi = {
  isError: boolean;
  message: string;
  series: AnalyticsTimeSeriesRow[];
  timezone: string;
};

export type AnalyticsActiveCategoryRow = {
  category_id: number;
  category_name: string;
  active_courses: number;
  active_courses_fm: number;
  active_courses_hm: number;
  active_student_seats: number;
  active_student_seats_fm: number;
  active_student_seats_hm: number;
};

export type AnalyticsActiveBreakdownApi = {
  isError: boolean;
  message: string;
  categories: AnalyticsActiveCategoryRow[];
  totals: {
    active_courses_fm: number;
    active_courses_hm: number;
    active_student_seats_fm: number;
    active_student_seats_hm: number;
  };
  is_fm_hm_breakdown_enabled: boolean;
};

export type AnalyticsRevenueRow = {
  period: { label: string; year: number; month?: number; iso_week?: number };
  total: string;
  revenue_delta: string | null;
};

export type AnalyticsRevenueApi = {
  isError: boolean;
  message: string;
  series: AnalyticsRevenueRow[];
  interval: string;
  timezone: string;
};

export type AnalyticsTeachingLoadCategory = {
  category_id: number;
  category_name: string;
  teacher_assignments: number;
  distinct_teachers: number;
};

export type AnalyticsTeachingLoadApi = {
  isError: boolean;
  message: string;
  categories: AnalyticsTeachingLoadCategory[];
  distinct_teachers_all_categories: number;
};
