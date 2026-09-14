const ALIASES: Record<string, string> = {
  "Asia/Yangon": "MMT",
  "Asia/Rangoon": "MMT",
};

export function formatTimezoneAbbrev(timeZone: string): string {
  const normalized = timeZone.trim();
  if (ALIASES[normalized]) return ALIASES[normalized];
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: normalized,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name && !name.startsWith("GMT")) {
      return name.toUpperCase();
    }
  } catch {
    // fall through
  }
  return "UTC";
}
