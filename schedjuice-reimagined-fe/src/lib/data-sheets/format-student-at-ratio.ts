/** Format student_count / assistant_teacher_count as "X : 1" (matches classes_data_sql). */
export function formatStudentAtRatio(
  studentCount: number | null | undefined,
  assistantTeacherCount: number | null | undefined,
): string {
  if (!assistantTeacherCount) return "0 : 0";
  const students = studentCount ?? 0;
  const ratio = Math.round((students / assistantTeacherCount) * 100) / 100;
  const trimmed = String(ratio)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  return `${trimmed} : 1`;
}
