import type { FormConfigField, FormSurface } from "@/types/form-config";

export type FormActor = "admin" | "user";

/** react-hook-form path the field binds to. */
export function fieldFormPath(field: FormConfigField): string {
  return field.source === "builtin"
    ? field.fieldKey
    : `custom_data.${field.fieldKey}`;
}

/**
 * Required on this surface?
 * - create  -> required iff requiredAt === "registration"
 * - edit    -> required iff requiredAt is "registration" OR "profile_completion"
 * - detail  -> never (read view)
 */
export function isFieldRequired(
  field: FormConfigField,
  surface: FormSurface
): boolean {
  if (surface === "detail") return false;
  if (field.requiredAt === "registration") return true;
  if (surface === "edit" && field.requiredAt === "profile_completion") return true;
  return false;
}

/**
 * Read-only when the acting user is not permitted to fill the field.
 * Staff (admin actor) may edit all fields, including those normally filled by the
 * user — matches backend custom_data validation, which only blocks user→admin fields.
 */
export function isFieldReadOnly(
  field: FormConfigField,
  actor: FormActor
): boolean {
  return field.filledBy === "admin" && actor !== "admin";
}
