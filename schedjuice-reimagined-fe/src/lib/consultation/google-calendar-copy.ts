import type { ConsultationGoogleCalendar } from "@/types/consultation";

export function formatGoogleCalendarAccountLabel(
  calendar: ConsultationGoogleCalendar | undefined,
): string | null {
  if (!calendar?.connected) {
    return null;
  }

  const email = calendar.authorized_email.trim();
  const name = calendar.authorized_display_name.trim();

  if (email && name && email !== name) {
    return `${name} (${email})`;
  }

  return email || name || null;
}
