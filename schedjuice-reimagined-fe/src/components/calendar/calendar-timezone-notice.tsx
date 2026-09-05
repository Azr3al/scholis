"use client";

import Link from "next/link";
import { getUserTimezoneInfo } from "@/helpers/date";
import { useUser } from "@/hooks/useUser";

/** Explains which time zone the calendar uses and links to account settings. */
export function CalendarTimezoneNotice() {
  const { user } = useUser();
  const tz = getUserTimezoneInfo();

  return (
    <div className="flex flex-col gap-1.5 px-2 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <p className="min-w-0 leading-relaxed">
        <span className="font-medium text-foreground">Time zone:</span>{" "}
        {tz.timezone} ({tz.offset}). Times on this calendar follow this zone.
      </p>
      {user?.id ? (
        <Link
          href={`/users/${user.id}?section=settings&pane=appearance`}
          className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Account settings
        </Link>
      ) : null}
    </div>
  );
}
