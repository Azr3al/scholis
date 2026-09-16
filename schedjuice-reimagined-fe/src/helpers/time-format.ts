import { hhmmTo12HourSegments } from "@/helpers/time-12h";

export type TimeDisplayFormatValue = "12h" | "24h";

export function resolveTimeDisplayFormat(raw: unknown): TimeDisplayFormatValue {
  return raw === "24h" || raw === "12h" ? raw : "12h";
}

function normalizeToHhMm(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const candidate = t.includes("T") ? t.split("T")[1]?.slice(0, 8) ?? t : t;
  const parts = candidate.split(":");
  if (parts.length < 2) return null;
  const h = parts[0].padStart(2, "0");
  const m = parts[1].padStart(2, "0");
  return `${h}:${m}`;
}

export function formatOrgTime(
  raw: string | null | undefined,
  format: TimeDisplayFormatValue = "12h",
): string {
  if (raw == null || !String(raw).trim()) return "—";
  const hhmm = normalizeToHhMm(String(raw));
  if (!hhmm) return "—";
  if (format === "24h") return hhmm;
  const { hour, minute, period } = hhmmTo12HourSegments(hhmm);
  if (!hour || !minute || !period) return "—";
  return `${hour.padStart(2, "0")}:${minute} ${period}`;
}

export function formatOrgTimeRange(
  from: string | null | undefined,
  to: string | null | undefined,
  format: TimeDisplayFormatValue = "12h",
): string {
  return `${formatOrgTime(from, format)} – ${formatOrgTime(to, format)}`;
}

/** date-fns pattern for wall-clock labels (not durations). */
export function orgTimeDateFnsPattern(
  format: TimeDisplayFormatValue = "12h",
): string {
  return format === "24h" ? "HH:mm" : "hh:mm a";
}
