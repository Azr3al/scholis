import {
  normalizeTimeToHhMm,
  type SimpleScheduleValue,
} from "@/helpers/simple-schedule";
import {
  CONSULTATION_WEEKDAY_KEYS,
  type ConsultationDaySchedule,
  type ConsultationWeekdayKey,
  type ConsultationWhitelist,
} from "@/types/consultation";

/** Mirrors backend LWTP preset window in app_consultation/presets.py */
export const CONSULTATION_DEFAULT_WINDOW = {
  start: "18:00",
  end: "20:00",
} as const;

const SHORT_TO_CONSULTATION: Record<string, ConsultationWeekdayKey> = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

const CONSULTATION_TO_SHORT: Record<ConsultationWeekdayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const CONSULTATION_WEEKDAY_LABELS: Record<
  ConsultationWeekdayKey,
  string
> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function shortWeekdayToConsultation(
  short: string,
): ConsultationWeekdayKey | undefined {
  return SHORT_TO_CONSULTATION[short];
}

export function consultationWeekdayToShort(day: ConsultationWeekdayKey): string {
  return CONSULTATION_TO_SHORT[day];
}

export function emptyDaySchedule(): ConsultationDaySchedule {
  return { enabled: false, windows: [] };
}

export function normalizeWhitelistSchedule(
  schedule: ConsultationWhitelist["schedule"] | undefined,
): Record<ConsultationWeekdayKey, ConsultationDaySchedule> {
  return Object.fromEntries(
    CONSULTATION_WEEKDAY_KEYS.map((day) => [
      day,
      schedule?.[day] ?? emptyDaySchedule(),
    ]),
  ) as Record<ConsultationWeekdayKey, ConsultationDaySchedule>;
}

function windowKey(window: { start: string; end: string }): string {
  const start = normalizeTimeToHhMm(window.start);
  const end = normalizeTimeToHhMm(window.end);
  return `${start}|${end}`;
}

export function scheduleToSimpleValue(
  schedule: Record<ConsultationWeekdayKey, ConsultationDaySchedule>,
): SimpleScheduleValue | null {
  const enabledDays = CONSULTATION_WEEKDAY_KEYS.filter((day) => {
    const config = schedule[day];
    return config.enabled && config.windows.length > 0;
  });

  if (enabledDays.length === 0) {
    return {
      weekdays: [],
      time_from: CONSULTATION_DEFAULT_WINDOW.start,
      time_to: CONSULTATION_DEFAULT_WINDOW.end,
      course_type: null,
    };
  }

  let referenceKey: string | null = null;
  let referenceWindow: { start: string; end: string } | null = null;

  for (const day of enabledDays) {
    const config = schedule[day];
    if (config.windows.length !== 1) {
      return null;
    }
    const key = windowKey(config.windows[0]);
    if (referenceKey === null) {
      referenceKey = key;
      referenceWindow = config.windows[0];
    } else if (key !== referenceKey) {
      return null;
    }
  }

  if (!referenceWindow) {
    return null;
  }

  return {
    weekdays: enabledDays.map(consultationWeekdayToShort),
    time_from: normalizeTimeToHhMm(referenceWindow.start),
    time_to: normalizeTimeToHhMm(referenceWindow.end),
    course_type: null,
  };
}

export function simpleValueToSchedule(
  value: SimpleScheduleValue,
): Record<ConsultationWeekdayKey, ConsultationDaySchedule> {
  const selected = new Set(
    value.weekdays
      .map(shortWeekdayToConsultation)
      .filter((day): day is ConsultationWeekdayKey => day !== undefined),
  );

  const time_from = normalizeTimeToHhMm(value.time_from);
  const time_to = normalizeTimeToHhMm(value.time_to);
  const hasWindow = Boolean(time_from && time_to);

  return Object.fromEntries(
    CONSULTATION_WEEKDAY_KEYS.map((day) => {
      if (selected.has(day) && hasWindow) {
        return [
          day,
          {
            enabled: true,
            windows: [{ start: time_from, end: time_to }],
          } satisfies ConsultationDaySchedule,
        ];
      }
      return [day, emptyDaySchedule()];
    }),
  ) as Record<ConsultationWeekdayKey, ConsultationDaySchedule>;
}

export function canCollapseWhitelistSchedule(
  schedule: Record<ConsultationWeekdayKey, ConsultationDaySchedule>,
): boolean {
  return scheduleToSimpleValue(schedule) !== null;
}

export type WhitelistScheduleValidationError = {
  day: ConsultationWeekdayKey;
  windowIndex: number;
  message: string;
};

export function validateWhitelistSchedule(
  schedule: Record<ConsultationWeekdayKey, ConsultationDaySchedule>,
): WhitelistScheduleValidationError[] {
  const errors: WhitelistScheduleValidationError[] = [];

  for (const day of CONSULTATION_WEEKDAY_KEYS) {
    const config = schedule[day];
    if (!config.enabled) continue;

    config.windows.forEach((window, windowIndex) => {
      const start = normalizeTimeToHhMm(window.start);
      const end = normalizeTimeToHhMm(window.end);
      if (!start || !end) {
        errors.push({
          day,
          windowIndex,
          message: "Start and end times are required.",
        });
        return;
      }
      if (start >= end) {
        errors.push({
          day,
          windowIndex,
          message: "End time must be after start time.",
        });
      }
    });
  }

  return errors;
}
