import type { GradesTableColumnKey } from "./types";

export const SAMPLE_BINDER: Record<string, string> = {
  school_name: "Sample School",
  student_name: "Alex Student",
  registration: "STU-1001",
  course_name: "Sample course",
  period: "May 2026",
  academic_year: "2025/26",
  current_date: "17 Aug 2026",
  mt_name: "Jordan Mentor",
  pronoun: "she",
};

export const SAMPLE_GRADE_ROWS: Record<GradesTableColumnKey, string>[] = [
  {
    subject_name: "Mathematics",
    mark: "88",
    letter_grade: "A",
    comment: "Strong work",
  },
  {
    subject_name: "English",
    mark: "76",
    letter_grade: "B",
    comment: "Keep reading",
  },
  {
    subject_name: "Science",
    mark: "91",
    letter_grade: "A",
    comment: "Excellent",
  },
];

export const VARIABLE_OPTIONS = [
  { key: "school_name", label: "School name" },
  { key: "student_name", label: "Student name" },
  { key: "registration", label: "Registration" },
  { key: "course_name", label: "Course name" },
  { key: "period", label: "Period" },
  { key: "academic_year", label: "Academic year" },
  { key: "current_date", label: "Current date" },
  { key: "mt_name", label: "MT name" },
  { key: "pronoun", label: "Pronoun" },
] as const;

export const TABLE_COLUMN_OPTIONS: { key: GradesTableColumnKey; label: string }[] =
  [
    { key: "subject_name", label: "Subject" },
    { key: "mark", label: "Mark" },
    { key: "letter_grade", label: "Letter grade" },
    { key: "comment", label: "Comment" },
  ];
