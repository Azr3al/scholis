export type AcademicPaneId = "courses" | "schedule" | "assessments" | "history";

export const ACADEMIC_PANES: { id: AcademicPaneId; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "schedule", label: "Schedule" },
  { id: "assessments", label: "Assessments" },
  { id: "history", label: "History" },
];

export const DEFAULT_ACADEMIC_PANE: AcademicPaneId = "courses";

const VALID = new Set<string>(ACADEMIC_PANES.map((p) => p.id));

export function isAcademicPaneId(value: string): value is AcademicPaneId {
  return VALID.has(value);
}
