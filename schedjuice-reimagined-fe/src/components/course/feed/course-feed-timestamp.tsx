"use client";

import { useDateFormatter } from "react-aria";

import { formatFeedPostTimestamp } from "@/helpers/course-feed-timestamp";

function useFeedPostTimestampFormatter(timezone: string) {
  const time = useDateFormatter({ hour: "numeric", minute: "2-digit" });
  const weekday = useDateFormatter({ weekday: "long" });
  const monthDay = useDateFormatter({ month: "short", day: "numeric" });
  const fullDate = useDateFormatter({
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (iso: string) =>
    formatFeedPostTimestamp(iso, timezone, {
      time,
      weekday,
      monthDay,
      fullDate,
    });
}

export function FeedPostTimestamp({
  iso,
  timezone,
  className,
}: {
  iso: string;
  timezone: string;
  className?: string;
}) {
  const format = useFeedPostTimestampFormatter(timezone);
  return (
    <time dateTime={iso} className={className} title={new Date(iso).toLocaleString()}>
      {format(iso)}
    </time>
  );
}
