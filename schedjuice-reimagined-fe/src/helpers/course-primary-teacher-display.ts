export function shouldShowCoursePrimaryTeacherName(
  mainTeacherCount: number | null | undefined,
): boolean {
  if (mainTeacherCount == null) return true;
  return mainTeacherCount <= 1;
}

export function coursePrimaryTeacherForDisplay<
  T extends { name?: string | null },
>(
  primaryTeacher: T | null | undefined,
  mainTeacherCount: number | null | undefined,
): T | null {
  if (!primaryTeacher?.name) return null;
  if (!shouldShowCoursePrimaryTeacherName(mainTeacherCount)) return null;
  return primaryTeacher;
}
