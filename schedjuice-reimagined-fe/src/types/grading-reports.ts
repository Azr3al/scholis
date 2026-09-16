export type GradingBand = { label: string; min_pct: number; max_pct: number };

export type MonthlyResultSheet = {
  id: number;
  course: number;
  year: number;
  month: number;
  exam_date: string;
  named_test_count: number;
  created_at: string;
  updated_at: string;
};

export type ResultColumn = {
  id: number;
  sheet: number;
  title: string;
  max_marks: number | null;
  is_named_test: boolean;
  sort_order: number;
};

export type ResultSheetStudent = {
  id: number;
  name: string;
  code: string | null;
  alternative_name: string;
  communication_email: string;
  is_removed: boolean;
};

export type ResultSheetGrid = {
  sheet: Pick<MonthlyResultSheet, "id" | "year" | "month" | "exam_date">;
  students: ResultSheetStudent[];
  columns: ResultColumn[];
  cells: Record<string, number | null>;
};

export type ProjectRating = {
  title: string;
  done: boolean;
  rating: "excellent" | "satisfactory" | "unsatisfactory" | null;
};

export type MonthlyReport = {
  id: number;
  batch: number;
  student: number;
  student_name: string;
  status: "draft" | "finalized";
  attendance: {
    total_days: number;
    attended: number;
    absent: number;
    pct: number;
  };
  test_lines: Array<{
    title: string;
    marks: number;
    max_marks: number;
    pct: number;
    grade: string;
  }>;
  overall: {
    total_marks: number;
    total_max: number;
    pct: number;
    grade: string;
  };
  project_ratings: ProjectRating[];
  teacher_remarks: string;
  finalized_at: string | null;
};

export type ReportBatch = {
  id: number;
  course: number;
  sheet: number;
  report_year: number;
  report_month: number;
  selected_sources: Array<{
    source_type: "external_column";
    column_id: number;
    title: string;
    max_marks: number;
  }>;
  project_templates: Array<{ title: string }>;
  created_at?: string;
  reports?: MonthlyReport[];
  finalized_count?: number;
  total_count?: number;
};
