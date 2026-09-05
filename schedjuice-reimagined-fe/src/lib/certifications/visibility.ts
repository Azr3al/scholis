import { canEditUser } from "@/helpers/authorization";
import { hasStaffRole } from "@/helpers/role";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export function canViewCertificationsSection({
  subject,
  viewer,
}: {
  tenant?: organizationType | null | undefined;
  subject: accountType;
  viewer: accountType;
}): boolean {
  return (
    hasStaffRole(subject.roles) &&
    (viewer.id === subject.id || canEditUser(viewer, subject.id))
  );
}
