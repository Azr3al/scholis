export function greetingFor(now: Date, timeZone: string): string {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(now),
    );
  } catch {
    hour = now.getHours();
  }
  if (!Number.isFinite(hour)) hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** First token of a display name, so the greeting stays short at display size. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function composeGreeting(
  fullName: string | null | undefined,
  now: Date,
  timeZone: string,
): string {
  const greeting = greetingFor(now, timeZone);
  const first = firstNameOf(fullName);
  return first ? `${greeting}, ${first}` : greeting;
}
