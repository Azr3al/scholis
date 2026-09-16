import {
  isGoogleMeetLink,
  isTeamsMeeting,
  isZoomMeeting,
  meetingPlatformIcon,
} from "@/helpers/discriminate-meeting-link";
import type { LeadAppointment } from "@/types/lead";

export const APPOINTMENT_PLATFORM_LABELS: Record<string, string> = {
  ZOOM: "Zoom",
  MEET: "Google Meet",
  IN_PERSON: "In person",
  PHONE: "Phone",
  OTHER: "Other",
};

export function appointmentPlatformLabel(
  appointment: Pick<LeadAppointment, "platform" | "meeting_link">,
): string {
  const link = appointment.meeting_link?.trim() ?? "";
  if (link) {
    if (isZoomMeeting(link)) return "Zoom";
    if (isTeamsMeeting(link)) return "Microsoft Teams";
    if (isGoogleMeetLink(link)) return "Google Meet";
  }
  return (
    APPOINTMENT_PLATFORM_LABELS[appointment.platform] ??
    appointment.platform ??
    "Appointment"
  );
}

export function appointmentPlatformDisplay(
  appointment: Pick<LeadAppointment, "platform" | "meeting_link">,
) {
  return {
    icon: meetingPlatformIcon(appointment.meeting_link, appointment.platform),
    label: appointmentPlatformLabel(appointment),
  };
}

export function nextLeadAppointment(
  appointments: LeadAppointment[] | undefined,
): LeadAppointment | null {
  if (!appointments?.length) return null;
  const sorted = [...appointments].sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  const upcoming = sorted.find(
    (item) =>
      item.outcome === "SCHEDULED" &&
      new Date(item.scheduled_at).getTime() >= Date.now(),
  );
  return upcoming ?? sorted[sorted.length - 1] ?? null;
}
