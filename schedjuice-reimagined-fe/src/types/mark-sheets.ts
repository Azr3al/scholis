export type RubricColumnKind = "score" | "computed_total" | "identifier" | "ignored";

export type RubricColumn = {
  key: string;
  title: string;
  kind: RubricColumnKind;
  max_marks?: number;
  sort_order: number;
};

export type CourseRubric = {
  id: number;
  course: number;
  title: string;
  columns: RubricColumn[];
  source: "import_inferred" | "manual";
  created_by?: number;
  created_at?: string;
  updated_at?: string;
};

export type MarkSheet = {
  id: number;
  course: number;
  rubric: number;
  rubric_title?: string;
  title: string;
  year: number;
  month: number;
  exam_date: string | null;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  filled_cell_count?: number;
};

export type MarkSheetStudent = {
  id: number;
  name: string;
  code: string;
  alternative_name: string;
  communication_email: string;
};

export type MarkSheetGrid = {
  sheet: MarkSheet;
  rubric: CourseRubric;
  students: MarkSheetStudent[];
  cells: Record<string, number | null>;
  computed: Record<string, number | null>;
};

export type RubricMatchSuggestion = {
  rubric: CourseRubric;
  similarity: number;
};

export type ImportParseResult = {
  headers: string[];
  rows: (string | number | null)[][];
  inferred_columns: RubricColumn[];
  column_mapping?: Record<string, number>;
  warnings?: string[];
};
