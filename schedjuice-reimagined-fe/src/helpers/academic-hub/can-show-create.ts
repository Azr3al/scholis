/**
 * Academic Hub "Add classes" visibility.
 * Matches backend CourseListView POST: course.create OR (teacher + tenant flag).
 * Teachers do not get course.create in the default RBAC matrix.
 */
export function canShowAcademicHubCreate(args: {
  hasCourseCreatePermission: boolean;
  isOnlyTeacher: boolean;
  canTeacherCreateCourse: boolean;
}): boolean {
  return (
    args.hasCourseCreatePermission ||
    (args.isOnlyTeacher && args.canTeacherCreateCourse)
  );
}
