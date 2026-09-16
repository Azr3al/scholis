export function formatDuplicateSubjectTitle(
  baseTitle: string,
  occurrenceIndex: number,
): string {
  if (occurrenceIndex <= 1) return baseTitle;
  return `${baseTitle} (${occurrenceIndex})`;
}

export function countExistingCoursesBySubject(
  courses: Array<{ subject?: number | { id: number } | null }>,
): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const course of courses) {
    const subject = course.subject;
    const subjectId =
      typeof subject === "number"
        ? subject
        : subject && typeof subject === "object"
          ? subject.id
          : undefined;
    if (subjectId == null) continue;
    counts[subjectId] = (counts[subjectId] ?? 0) + 1;
  }
  return counts;
}

export function nextDuplicateSubjectTitle(
  baseTitle: string,
  existingCount: number,
  pendingCount: number,
): string {
  return formatDuplicateSubjectTitle(baseTitle, existingCount + pendingCount + 1);
}
