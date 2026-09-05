import { canEditUser } from "@/helpers/authorization";
import type { accountType } from "@/types/user";

export const STEWARD_USER_KEYS = [
  "name",
  "alternative_name",
  "phone_number",
  "communication_email",
  "house_number",
  "street",
  "township",
  "city",
  "region",
  "country",
  "profile_image",
  "id_photo",
] as const;

export type StewardUserKey = (typeof STEWARD_USER_KEYS)[number];

export type UserWriteMode = "full" | "steward" | "none";

export function canMutateUserField(args: {
  viewer: accountType;
  subject: Pick<accountType, "id" | "user_write_mode" | "writable_fields">;
  field: string;
}): boolean {
  if (canEditUser(args.viewer, args.subject.id)) return true;
  if (args.subject.user_write_mode !== "steward") return false;
  return (args.subject.writable_fields ?? []).includes(args.field);
}

export const OVERVIEW_IDENTITY_FIELDS = [
  "name",
  "alternative_name",
  "communication_email",
  "phone_number",
  "house_number",
  "street",
  "township",
  "city",
  "region",
  "country",
] as const;

export const OVERVIEW_ALWAYS_LOCKED_FIELDS = ["email"] as const;

export const STEWARD_FIELD_LABELS: Record<string, string> = {
  name: "Full name",
  alternative_name: "Alternative name",
  phone_number: "Phone",
  communication_email: "Communication email",
  house_number: "House number",
  street: "Street",
  township: "Township",
  city: "City",
  region: "Region",
  country: "Country",
  profile_image: "Profile photo",
  id_photo: "ID photo",
};

export function overviewFieldLocked(args: {
  viewer: accountType;
  subject: Pick<accountType, "id" | "user_write_mode" | "writable_fields">;
  field: string;
}): boolean {
  if (args.field === "email") return true;
  return !canMutateUserField(args);
}

export function canViewPeopleFieldHistory(
  viewer: Pick<accountType, "id">,
  subject: Pick<accountType, "id" | "user_write_mode">,
): boolean {
  if (viewer.id === subject.id) return true;
  return (
    subject.user_write_mode === "full" || subject.user_write_mode === "steward"
  );
}
