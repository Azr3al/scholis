import { format } from "date-fns";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
import { isOvernightSession, overnightEndIsoDate } from "@/helpers/session-time";

type EventTimeslot = {
  date: string;
  time_from: string;
  time_to: string;
};

export const getTimezoneOffset = (timezone: string | undefined): string => {
  if (!timezone) return "";

  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    );
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    const offsetHours = offsetMs / (1000 * 60 * 60);
    const hours = Math.floor(Math.abs(offsetHours));
    const minutes = Math.floor((Math.abs(offsetHours) - hours) * 60);
    const sign = offsetHours >= 0 ? "+" : "-";

    return `GMT${sign}${hours}:${minutes.toString().padStart(2, "0")}`;
  } catch (error) {
    return "";
  }
};

const formatTime = (time: string): string => {
  // normalize to hours:minutes:seconds format
  if (!time) return "00:00:00";
  return time.length === 5 ? `${time}:00` : time;
};

export const toUtcFromTenant = (
  eventDate: string,
  eventTime: string,
  tenantTimeZone?: string
): Date => {
  const tz = tenantTimeZone || "UTC";

  const dateOnly = eventDate.split("T")[0];

  const timeWithSeconds =
    eventTime.length === 5 ? `${eventTime}:00` : eventTime;

  const tenantLocalDateTime = `${dateOnly} ${timeWithSeconds}`;

  return zonedTimeToUtc(tenantLocalDateTime, tz);
};

export const getTimeslotUtcRange = (
  event: EventTimeslot,
  tenantTimeZone: string | undefined
) => {
  const dateOnly = event.date.split("T")[0];
  const utcStart = toUtcFromTenant(dateOnly, event.time_from, tenantTimeZone);
  const endDate = isOvernightSession(event.time_from, event.time_to)
    ? overnightEndIsoDate(dateOnly)
    : dateOnly;
  const utcEnd = toUtcFromTenant(endDate, event.time_to, tenantTimeZone);
  return { utcStart, utcEnd };
};

export const formatTimeslotRangeForDisplay = (
  event: EventTimeslot,
  tenantTimeZone: string | undefined,
  displayFormat = "hh:mm a"
): string => {
  const { utcStart, utcEnd } = getTimeslotUtcRange(event, tenantTimeZone);

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const displayStart = utcToZonedTime(utcStart, userTimezone);
  const displayEnd = utcToZonedTime(utcEnd, userTimezone);
  return `${format(displayStart, displayFormat)} - ${format(
    displayEnd,
    displayFormat
  )}`;
};

export const formatTimeslotStartForDisplay = (
  event: EventTimeslot,
  tenantTimeZone: string | undefined,
  displayFormat = "hh:mm a"
): string => {
  const { utcStart } = getTimeslotUtcRange(event, tenantTimeZone);
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayStart = utcToZonedTime(utcStart, userTimezone);
  return format(displayStart, displayFormat);
};

export const convertTimePatternToUserTimezone = (
  tenantTimePattern: string,
  tenantTimeZone: string | undefined,
  displayFormat = "h:mm a"
): string => {
  if (!tenantTimePattern || !tenantTimeZone) return tenantTimePattern;

  try {
    const [startTime, endTime] = tenantTimePattern.split(" - ");
    if (!startTime || !endTime) return tenantTimePattern;

    const parse12HourTime = (timeStr: string): string => {
      const trimmed = timeStr.trim();
      const parts = trimmed.split(" ");
      if (parts.length !== 2) return trimmed;

      const [timePart, ampmPart] = parts;
      const [hours, minutes] = timePart.split(":").map(Number);

      let hour24 = hours;
      if (ampmPart.toUpperCase() === "PM" && hours !== 12) {
        hour24 = hours + 12;
      } else if (ampmPart.toUpperCase() === "AM" && hours === 12) {
        hour24 = 0;
      }

      return `${hour24.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:00`;
    };

    const startTime24 = parse12HourTime(startTime);
    const endTime24 = parse12HourTime(endTime);
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const startDateTimeStr = `${todayStr}T${startTime24}`;
    const endDateTimeStr = `${todayStr}T${endTime24}`;

    const startUtc = zonedTimeToUtc(startDateTimeStr, tenantTimeZone);
    const endUtc = zonedTimeToUtc(endDateTimeStr, tenantTimeZone);

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startLocal = utcToZonedTime(startUtc, userTimezone);
    const endLocal = utcToZonedTime(endUtc, userTimezone);

    const startFormatted = format(startLocal, displayFormat);
    const endFormatted = format(endLocal, displayFormat);

    return `${startFormatted} - ${endFormatted}`;
  } catch (error) {
    return tenantTimePattern;
  }
};

export const convertWeekdayPatternToUserTimezone = (
  tenantWeekdayPattern: string,
  tenantTimeZone: string | undefined
): string => {
  if (!tenantWeekdayPattern || !tenantTimeZone) return tenantWeekdayPattern;

  // patterns that don't need conversion
  if (
    tenantWeekdayPattern === "All Days" ||
    tenantWeekdayPattern === "Weekdays" ||
    tenantWeekdayPattern === "Weekends"
  ) {
    return tenantWeekdayPattern;
  }

  try {
    const dayNames = tenantWeekdayPattern.split(", ").map((day) => day.trim());
    const dayMapping = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const tenantDays = dayNames
      .map((day) => dayMapping[day as keyof typeof dayMapping])
      .filter((day) => day !== undefined);

    if (tenantDays.length === 0) return tenantWeekdayPattern;

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userDays = new Set<number>();

    // convert each tenant day to user day
    // use sample data to test timezone conversion and get the correct weekday number
    for (const tenantDay of tenantDays) {
      const today = new Date();
      const daysUntilTarget = (tenantDay - today.getDay() + 7) % 7;
      const sampleDate = new Date(today);
      sampleDate.setDate(today.getDate() + daysUntilTarget);

      const dateStr = sampleDate.toISOString().split("T")[0];
      const tenantDateTime = `${dateStr}T01:00:00`;

      const utcDateTime = zonedTimeToUtc(tenantDateTime, tenantTimeZone);
      const userDateTime = utcToZonedTime(utcDateTime, userTimezone);

      const userDay = userDateTime.getDay();
      userDays.add(userDay);
    }

    const userDayNames = Array.from(userDays)
      .sort()
      .map((day) => {
        const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return names[day];
      });

    // safe check for special patterns
    const userDaysArray = Array.from(userDays).sort();
    if (userDaysArray.length === 7) return "All Days";
    if (
      userDaysArray.length === 5 &&
      userDaysArray.every((day) => day >= 1 && day <= 5)
    )
      return "Weekdays";
    if (
      userDaysArray.length === 2 &&
      userDaysArray.includes(0) &&
      userDaysArray.includes(6)
    )
      return "Weekends";

    const result = userDayNames.join(", ");
    return result;
  } catch (error) {
    return tenantWeekdayPattern;
  }
};

export const convertEventDateToUserTimezone = (
  eventDate: string,
  eventTime: string,
  tenantTimeZone: string | undefined
): string => {
  try {
    const utcDate = toUtcFromTenant(eventDate, eventTime, tenantTimeZone);
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userLocalDate = utcToZonedTime(utcDate, userTimezone);
    return format(userLocalDate, "yyyy-MM-dd");
  } catch (error) {
    return eventDate;
  }
};

export const convertUtcToTenantTime = (
  utcDateTimeString: string,
  tenantTimeZone: string | undefined
): string => {
  if (!utcDateTimeString) return "";
  if (!tenantTimeZone) return formatTime(utcDateTimeString);

  try {
    const utcDate = new Date(utcDateTimeString);
    const tenantDate = utcToZonedTime(utcDate, tenantTimeZone);
    return format(tenantDate, "HH:mm");
  } catch (error) {
    return formatTime(utcDateTimeString);
  }
};

export const convertTenantTimeToUtc = (
  eventDate: string,
  tenantTime: string,
  tenantTimeZone: string | undefined
): string => {
  if (!tenantTime || !eventDate) return "";
  if (!tenantTimeZone) return `${eventDate}T${formatTime(tenantTime)}Z`;

  try {
    const normalizedTime = formatTime(tenantTime);
    const tenantDateTime = `${eventDate}T${normalizedTime}`;
    const utcDate = zonedTimeToUtc(tenantDateTime, tenantTimeZone);
    return utcDate.toISOString();
  } catch (error) {
    return `${eventDate}T${formatTime(tenantTime)}Z`;
  }
};

export const formatTimeInTenantTimezone = (
  timeString: string,
  tenantTimeZone: string | undefined,
  displayFormat: string = "HH:mm"
): string => {
  if (!timeString) return "-";

  try {
    if (timeString.match(/^\d{2}:\d{2}$/)) {
      return timeString;
    }
    const utcDate = new Date(timeString);
    if (tenantTimeZone) {
      const tenantDate = utcToZonedTime(utcDate, tenantTimeZone);
      return format(tenantDate, displayFormat);
    } else {
      return format(utcDate, displayFormat);
    }
  } catch (error) {
    return timeString;
  }
};

export const formatTimeInUserTimezone = (
  timeString: string,
  tenantTimezone: string | undefined,
  userTimezone: string
) => {
  if (!timeString || !tenantTimezone) {
    return formatTime(timeString);
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const tenantDateTime = `${today}T${timeString}`;

    const utcDate = zonedTimeToUtc(tenantDateTime, tenantTimezone);
    const userDate = utcToZonedTime(utcDate, userTimezone);
    const convertedTime = format(userDate, "HH:mm");

    return convertedTime;
  } catch (error) {
    return formatTime(timeString);
  }
};
