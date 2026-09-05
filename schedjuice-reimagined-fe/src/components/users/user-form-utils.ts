import { countries } from "@/config/countries";
import { getDateISOString } from "@/helpers/date";
import {
  convertTenantTimeToUtc,
  convertUtcToTenantTime,
} from "@/helpers/timeslot";
import type { organizationType } from "@/types/organization";
import type { FormConfigField } from "@/types/form-config";
import { hasStaffRole } from "@/helpers/role";
import type { accountType } from "@/types/user";

const TIME_FIELDS = ["preferred_checkin_time", "preferred_checkout_time"] as const;
const DATE_FIELDS = [
  "contract_expiry_date",
  "probation_end_date",
  "employment_start_date",
] as const;

/** Fields collected on admin create step one (profile + access). */
export const USER_CREATE_IDENTITY_KEYS = [
  "name",
  "microsoft_display_name",
  "email",
  "communication_email",
  "phone_number",
  "roles",
  "code",
] as const;

export type UserCreateIdentityKey = (typeof USER_CREATE_IDENTITY_KEYS)[number];

const PUBLIC_PROFILE_PAYLOAD_KEYS = [
  "qualifications",
  "is_public_profile_enabled",
  "show_certifications_on_public_profile",
  "public_profile_slug",
] as const;

/** Public profile fields saved explicitly (not via blur autosave). */
export const PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS = [
  "qualifications",
  "is_public_profile_enabled",
  "show_certifications_on_public_profile",
] as const;

export type PublicProfileExplicitSaveKey =
  (typeof PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS)[number];

/** Build partial PUT body for explicit public profile save (slug is server-assigned). */
export function pickPublicProfileSavePayload(
  normalized: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      payload[key] = normalized[key];
    }
  }
  return payload;
}

/** Omit public profile fields unless the payload roles include staff. */
export function omitPublicProfileUnlessStaff(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (hasStaffRole(payload.roles as string[] | undefined)) {
    delete payload.public_profile_slug;
    return payload;
  }
  for (const key of PUBLIC_PROFILE_PAYLOAD_KEYS) {
    delete payload[key];
  }
  return payload;
}

/** @deprecated Use omitPublicProfileUnlessStaff */
export const omitPublicProfileUnlessTeacher = omitPublicProfileUnlessStaff;

export function getUserFormCreateDefaults() {
  return { roles: [] as string[], custom_data: {} as Record<string, unknown> };
}

/** Strip form values to step-one identity fields for skip / identity-only create. */
export function pickIdentityFormValues(data: Record<string, unknown>) {
  const picked: Record<string, unknown> = {};
  for (const key of USER_CREATE_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      picked[key] = data[key];
    }
  }
  return picked;
}

const countryNameToCode = new Map(
  countries.map((entry) => [entry.name.toLowerCase(), entry.code]),
);

/** Map stored country names or legacy values to ISO codes used by CountrySelect. */
export function normalizeCountryToCode(country: unknown): unknown {
  if (typeof country !== "string" || !country.trim()) return country;
  const trimmed = country.trim();
  if (countries.some((entry) => entry.code === trimmed)) return trimmed;
  return countryNameToCode.get(trimmed.toLowerCase()) ?? country;
}

/** Convert API user payload to form values (edit hydrate). */
export function hydrateUserForForm(
  user: accountType,
  tenant?: organizationType | null
) {
  const userData = { ...(user as Record<string, unknown>) };

  if (userData.country != null) {
    userData.country = normalizeCountryToCode(userData.country);
  }

  for (const field of TIME_FIELDS) {
    const value = userData[field];
    if (typeof value === "string" && value) {
      userData[field] = convertUtcToTenantTime(value, tenant?.timezone);
    }
  }

  if (!userData.custom_data || typeof userData.custom_data !== "object") {
    userData.custom_data = {};
  }

  return userData;
}

/** Normalize custom_data date/datetime values for API submit. */
export function normalizeCustomDataForSubmit(
  customData: Record<string, unknown> | undefined,
  fields: FormConfigField[],
): Record<string, unknown> {
  const out = { ...(customData ?? {}) };
  for (const field of fields) {
    if (field.source !== "custom") continue;
    const raw = out[field.fieldKey];
    if (raw == null || raw === "") continue;
    if (field.fieldType === "date") {
      out[field.fieldKey] = getDateISOString(new Date(raw as string | Date));
    } else if (field.fieldType === "datetime") {
      const d = raw instanceof Date ? raw : new Date(raw as string);
      if (!Number.isNaN(d.getTime())) out[field.fieldKey] = d.toISOString();
    }
  }
  return out;
}

/** Normalize form values before API submit. */
export function prepareUserFormPayload(
  data: Record<string, unknown>,
  options: {
    mode: "create" | "edit";
    tenant?: organizationType | null;
    fields?: FormConfigField[];
  }
) {
  const payload = { ...data };

  for (const field of TIME_FIELDS) {
    const value = payload[field];
    if (typeof value === "string" && value) {
      const today = new Date().toISOString().split("T")[0];
      payload[field] = convertTenantTimeToUtc(
        today,
        value,
        options.tenant?.timezone
      );
    }
  }

  for (const field of DATE_FIELDS) {
    const value = payload[field];
    if (value instanceof Date || (value && typeof value === "string")) {
      payload[field] = getDateISOString(new Date(value as string | Date));
    }
  }

  if (payload.date_of_birth) {
    payload.date_of_birth = getDateISOString(
      new Date(payload.date_of_birth as string | Date)
    );
  } else {
    payload.date_of_birth = null;
  }

  if (options.mode === "create") {
    payload.password = "Password123$";
  }

  if (!options.tenant?.is_microsoft_on) {
    delete payload.microsoft_display_name;
  }

  if (payload.code === "") {
    delete payload.code;
  }

  if (options.fields?.length) {
    payload.custom_data = normalizeCustomDataForSubmit(
      payload.custom_data as Record<string, unknown> | undefined,
      options.fields,
    );
  }

  return omitPublicProfileUnlessStaff(payload);
}

export function isMyanmarCountry(country: unknown) {
  return country === "MM" || country === "Myanmar";
}
