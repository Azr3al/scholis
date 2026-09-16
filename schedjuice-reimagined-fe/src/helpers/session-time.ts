const MINUTES_PER_DAY = 24 * 60;
export const OVERNIGHT_CONFIRM_THRESHOLD_MINUTES = 120;

export function normalizeTimeToMinutes(time: string): number {
  const [h, m] = (time || "0:0").split(":").map((x) => parseInt(x || "0", 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isOvernightSession(from: string, to: string): boolean {
  const a = normalizeTimeToMinutes(from);
  const b = normalizeTimeToMinutes(to);
  return b <= a && a !== b;
}

export function sessionDurationMinutes(from: string, to: string): number {
  const a = normalizeTimeToMinutes(from);
  const b = normalizeTimeToMinutes(to);
  if (b > a) return b - a;
  if (b === a) return 0;
  return MINUTES_PER_DAY - a + b;
}

export function isValidSessionTimeRange(
  from?: string | null,
  to?: string | null
): boolean {
  if (!from?.trim() || !to?.trim()) return false;
  const minutes = sessionDurationMinutes(from, to);
  return minutes > 0 && minutes <= MINUTES_PER_DAY;
}

export function requiresOvernightConfirmation(from: string, to: string): boolean {
  return (
    isOvernightSession(from, to) &&
    sessionDurationMinutes(from, to) >= OVERNIGHT_CONFIRM_THRESHOLD_MINUTES
  );
}

export function validateSessionTimeRange(
  from?: string | null,
  to?: string | null
): string | null {
  if (!from?.trim() || !to?.trim()) {
    return "Start and end time are required.";
  }
  const minutes = sessionDurationMinutes(from, to);
  if (minutes <= 0) {
    return "End time must be after start time";
  }
  if (minutes > MINUTES_PER_DAY) {
    return "Session cannot be longer than 24 hours";
  }
  return null;
}

export function overnightEndIsoDate(startIsoDate: string): string {
  const dateOnly = startIsoDate.split("T")[0];
  const [year, month, day] = dateOnly.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function eventBoundsUtc(
  isoDate: string,
  from: string,
  to: string,
  orgTimezone: string,
  toUtcFromTenant: (date: string, time: string, tz?: string) => Date
): { start: Date; end: Date } {
  const dateOnly = isoDate.split("T")[0];
  const start = toUtcFromTenant(dateOnly, from, orgTimezone);
  const endDate = isOvernightSession(from, to)
    ? overnightEndIsoDate(dateOnly)
    : dateOnly;
  const end = toUtcFromTenant(endDate, to, orgTimezone);
  return { start, end };
}

export function eventsOverlapUtc(
  a: { date: string; time_from: string; time_to: string },
  b: { date: string; time_from: string; time_to: string },
  orgTimezone: string,
  toUtcFromTenant: (date: string, time: string, tz?: string) => Date
): boolean {
  const aDate = typeof a.date === "string" ? a.date.split("T")[0] : String(a.date);
  const bDate = typeof b.date === "string" ? b.date.split("T")[0] : String(b.date);
  const { start: a0, end: a1 } = eventBoundsUtc(
    aDate,
    a.time_from,
    a.time_to,
    orgTimezone,
    toUtcFromTenant
  );
  const { start: b0, end: b1 } = eventBoundsUtc(
    bDate,
    b.time_from,
    b.time_to,
    orgTimezone,
    toUtcFromTenant
  );
  return a0.getTime() < b1.getTime() && a1.getTime() > b0.getTime();
}

export function formatSessionTimeRange(
  from: string,
  to: string,
  formatTime: (time: string) => string,
  opts?: { showOvernightSuffix?: boolean }
): string {
  const showSuffix = opts?.showOvernightSuffix !== false;
  const base = `${formatTime(from)} – ${formatTime(to)}`;
  if (showSuffix && isOvernightSession(from, to)) {
    return `${base} (+1)`;
  }
  return base;
}

/** Same-day-only validation for intake / course-create paths. */
export function isClassTimeRangeValidSameDay(
  time_from: string | null | undefined,
  time_to: string | null | undefined
): boolean {
  if (!time_from?.trim() || !time_to?.trim()) return false;
  return normalizeTimeToMinutes(time_to) > normalizeTimeToMinutes(time_from);
}
