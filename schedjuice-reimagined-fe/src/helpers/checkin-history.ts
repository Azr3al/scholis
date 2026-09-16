import { convertTenantTimeToUtc, convertUtcToTenantTime } from "@/helpers/timeslot";
import { formatTime } from "@/helpers/date";

export function getDateOnly(isoDateTime?: string | null): string | null {
  if (!isoDateTime) return null;
  return isoDateTime.split("T")[0] ?? null;
}

export function utcDateTimeToTenantHHmm(
  utcDateTime?: string | null,
  tenantTimezone?: string
): string | null {
  if (!utcDateTime) return null;
  try {
    return formatTime(convertUtcToTenantTime(utcDateTime, tenantTimezone));
  } catch {
    return null;
  }
}

export function tenantHHmmToUtcDateTime(
  eventDateOnly: string | null,
  hhmm: string | null,
  tenantTimezone?: string
): string | null {
  if (!eventDateOnly || !hhmm) return null;
  return convertTenantTimeToUtc(eventDateOnly, hhmm, tenantTimezone);
}
