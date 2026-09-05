import { permissionsFor } from "@/helpers/authorization";
import type { RecordSectionContext } from "@/components/record/record-sections";
import type { accountType } from "@/types/user";

export const CONSULTANT_ROLE_SLUG = "consultant";

export function userHasConsultantRole(
  user: Pick<accountType, "roles">,
): boolean {
  const roles = user.roles as string[] | undefined;
  return roles?.includes(CONSULTANT_ROLE_SLUG) ?? false;
}

/** Self-view consultation section when the subject has the consultant role. */
export function canViewConsultationSection({
  subject,
  viewer,
}: RecordSectionContext): boolean {
  return viewer.id === subject.id && userHasConsultantRole(subject);
}

export function canViewConsultationBookings(viewer: accountType): boolean {
  return permissionsFor(viewer).can("consultation.view");
}

export function canManageConsultationSchedule(viewer: accountType): boolean {
  return permissionsFor(viewer).can("consultation.manage_schedule");
}

export function canCancelConsultationBooking(viewer: accountType): boolean {
  return permissionsFor(viewer).can("consultation.update");
}
