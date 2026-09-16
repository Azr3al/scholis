import { ConsultationReadinessKey } from "@/types/consultation";

const READINESS_MESSAGES: Record<ConsultationReadinessKey, string> = {
  [ConsultationReadinessKey.GoogleIdentity]:
    "Connect your Google account under Connectors.",
  [ConsultationReadinessKey.GoogleCalendar]:
    "Connect Google Calendar below.",
  [ConsultationReadinessKey.Whitelist]:
    "Add at least one open time window in your weekly schedule.",
  [ConsultationReadinessKey.OrgDisabled]:
    "Your school has consultation booking turned off.",
};

export function readinessMissingMessages(
  missing: ConsultationReadinessKey[],
): string[] {
  return missing.map((key) => READINESS_MESSAGES[key] ?? key);
}
