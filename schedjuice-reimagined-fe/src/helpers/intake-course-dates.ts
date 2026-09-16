import { getDateISOString } from "@/helpers/date";

export type DateRange = {
  start_date?: string | Date | null;
  end_date?: string | Date | null;
};

export function toDateOnlyIso(value?: string | Date | null): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : getDateISOString(parsed);
  }
  return getDateISOString(value);
}

export function courseDatesMatchIntake(
  courseDates: DateRange,
  intakeDates: DateRange,
): boolean {
  const courseStart = toDateOnlyIso(courseDates.start_date);
  const courseEnd = toDateOnlyIso(courseDates.end_date);
  const intakeStart = toDateOnlyIso(intakeDates.start_date);
  const intakeEnd = toDateOnlyIso(intakeDates.end_date);
  if (!courseStart || !courseEnd || !intakeStart || !intakeEnd) return true;
  return courseStart === intakeStart && courseEnd === intakeEnd;
}

export function courseDatesDifferFromIntake(
  courseDates: DateRange,
  intakeDates?: DateRange | null,
): boolean {
  if (!intakeDates) return false;
  return !courseDatesMatchIntake(courseDates, intakeDates);
}

export function getEffectiveCourseDates(
  defaults: DateRange,
  override?: DateRange | null,
): { start_date?: string; end_date?: string } {
  return {
    start_date:
      toDateOnlyIso(override?.start_date) ?? toDateOnlyIso(defaults.start_date),
    end_date:
      toDateOnlyIso(override?.end_date) ?? toDateOnlyIso(defaults.end_date),
  };
}

export function effectiveCourseDatesDifferFromIntake(
  defaults: DateRange,
  intakeDates: DateRange,
  override?: DateRange | null,
): boolean {
  const effective = getEffectiveCourseDates(defaults, override);
  return courseDatesDifferFromIntake(effective, intakeDates);
}
