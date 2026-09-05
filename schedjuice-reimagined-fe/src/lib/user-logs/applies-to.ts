import type { ReportType } from "@/types/user-log";

export function isStudentRoles(roles: string[]): boolean {
  return (roles ?? []).includes("student");
}

export function isStaffRoles(roles: string[]): boolean {
  return (roles ?? []).some((r) => r !== "student");
}

export function reportTypesForSubject(
  types: ReportType[],
  subjectRoles: string[],
): ReportType[] {
  const student = isStudentRoles(subjectRoles);
  const staff = isStaffRoles(subjectRoles);
  return types.filter((t) => {
    if (!t.is_active) return false;
    if (t.applies_to === "BOTH") return true;
    if (t.applies_to === "STUDENT") return student;
    if (t.applies_to === "STAFF") return staff;
    return false;
  });
}
