export function includeRemovedStudentsStorageKey(courseId: string | number): string {
  return `sj:attendance:include-removed:${courseId}`;
}
