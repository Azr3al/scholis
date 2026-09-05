import type { TimeValue } from "react-aria";

export type Time12Period = "AM" | "PM";

export type Time12Segments = {
  hour: string | null;
  minute: string | null;
  period: Time12Period | null;
};

const pad2 = (n: number | string) => String(n).padStart(2, "0");

export function hhmmTo12HourSegments(hhmm: string | null | undefined): Time12Segments {
  if (!hhmm) {
    return { hour: null, minute: null, period: null };
  }

  const [hourPart, minutePart] = hhmm.split(":");
  const hour24 = parseInt(hourPart ?? "0", 10);
  const minute = (minutePart ?? "00").padStart(2, "0");

  return {
    hour: hour24 % 12 === 0 ? "12" : String(hour24 % 12),
    minute,
    period: hour24 < 12 ? "AM" : "PM",
  };
}

export function segmentsToHhmm(
  hour12: string,
  minute: string,
  period: Time12Period,
): string {
  let h = parseInt(hour12, 10) % 12;
  if (period === "PM") h += 12;
  return `${pad2(h)}:${pad2(minute)}`;
}

export function timeValueTo12HourSegments(time: TimeValue | null): Time12Segments {
  if (!time) {
    return { hour: null, minute: null, period: null };
  }

  return {
    hour: time.hour % 12 === 0 ? "12" : String(time.hour % 12),
    minute: time.minute.toString().padStart(2, "0"),
    period: time.hour < 12 ? "AM" : "PM",
  };
}

export function segmentsToTimeValueHhmm(
  hour12: string,
  minute: string,
  period: Time12Period,
): string {
  return segmentsToHhmm(hour12, minute, period);
}
