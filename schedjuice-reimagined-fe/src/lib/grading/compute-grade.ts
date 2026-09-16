import type { GradingBand, ResultSheetGrid } from "@/types/grading-reports";

export const DEFAULT_GRADING_BANDS: GradingBand[] = [
  { label: "A+", min_pct: 85, max_pct: 100 },
  { label: "A", min_pct: 75, max_pct: 84 },
  { label: "B", min_pct: 56, max_pct: 74 },
  { label: "C", min_pct: 49, max_pct: 55 },
  { label: "D", min_pct: 0, max_pct: 48 },
];

export function computeGrade(
  marks: number,
  maxMarks: number,
  bands: GradingBand[],
): { pct: number; grade: string } {
  if (maxMarks <= 0) {
    return { pct: 0, grade: bands[bands.length - 1]?.label ?? "" };
  }
  const raw = (marks / maxMarks) * 100;
  const pct = Math.round(raw * 10) / 10;
  let grade = bands[bands.length - 1]?.label ?? "";
  for (const band of bands) {
    if (pct >= band.min_pct && pct <= band.max_pct) {
      grade = band.label;
      break;
    }
  }
  return { pct, grade };
}

export function computeStudentOverall(
  grid: ResultSheetGrid,
  studentId: number,
  bands: GradingBand[],
): { pct: number; grade: string } | null {
  let totalMarks = 0;
  let totalMax = 0;

  for (const col of grid.columns) {
    if (!col.is_named_test || col.max_marks == null) continue;
    const marks = grid.cells[`${col.id}:${studentId}`];
    if (marks == null) continue;
    totalMarks += marks;
    totalMax += col.max_marks;
  }

  if (totalMax === 0) return null;
  return computeGrade(totalMarks, totalMax, bands);
}
