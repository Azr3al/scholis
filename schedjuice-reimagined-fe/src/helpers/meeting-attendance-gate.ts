import {
  organizationType,
  VideoConferencingPlatform,
} from "@/types/organization";

/**
 * Staff meeting attendance (Teams and/or Zoom) — course nav and dashboard gate.
 */
/** Primary video platform is Zoom (e.g. show course.zoom_meeting_id on course forms). */
export function tenantIsZoomPlatform(
  tenant: organizationType | null | undefined,
): boolean {
  if (!tenant) return false;
  return tenant.video_conferencing_platform === VideoConferencingPlatform.zoom;
}

export function tenantShowsMeetingAttendance(
  tenant: organizationType | null | undefined,
): boolean {
  if (!tenant) return false;
  const v = tenant.video_conferencing_platform;
  if (v === VideoConferencingPlatform.microsoft_teams) return true;
  // Zoom-selected tenant: show meeting attendance whether meetings use school
  // ZoomAccount, teacher personal Zoom, or manual Zoom ids (school account optional).
  if (v === VideoConferencingPlatform.zoom) return true;
  if (
    (v === undefined || v === null) &&
    tenant.is_microsoft_on
  ) {
    return true;
  }
  return false;
}
