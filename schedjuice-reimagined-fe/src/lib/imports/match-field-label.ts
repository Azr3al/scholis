const MATCH_FIELD_LABELS: Record<string, string> = {
  communication_email: "communication email",
  phone_number: "phone number",
  emergency_contact_phone_number: "emergency contact phone",
  manual: "manual pick",
};

export function matchFieldLabel(field: string | null | undefined): string {
  if (!field) return "secondary field";
  return MATCH_FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}
