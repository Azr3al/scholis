import { isStudentOnlyUser, permissionsFor } from "@/helpers/authorization";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export function isStaffSubject(subject: Pick<accountType, "roles">): boolean {
  return !isStudentOnlyUser(subject);
}

export function canViewPointsSection({
  tenant,
  subject,
  viewer,
}: {
  tenant: organizationType | null | undefined;
  subject: accountType;
  viewer: accountType;
}): boolean {
  return (
    Boolean(tenant?.is_staff_points_enabled) &&
    isStaffSubject(subject) &&
    (viewer.id === subject.id || permissionsFor(viewer).can("points.view"))
  );
}
