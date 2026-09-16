export type SessionCheckinVisibilityInput = {
  isTeacher: boolean;
  isStudent: boolean;
  useTeacherSessionCheckin: boolean;
  useStudentCheckin: boolean;
};

export function canShowSessionCheckin(
  input: SessionCheckinVisibilityInput,
): boolean {
  if (input.isTeacher && input.useTeacherSessionCheckin !== false) {
    return true;
  }
  if (input.isStudent && input.useStudentCheckin === true) {
    return true;
  }
  return false;
}
