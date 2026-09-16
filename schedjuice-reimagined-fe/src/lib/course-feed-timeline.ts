import { formatInTimeZone } from "date-fns-tz";

import { getTenantRelativeDay } from "@/helpers/shortcuts-time";

export type FeedTimelinePost = { id: number; created_at: string };

export type FeedTimelineItem =
  | { kind: "day-divider"; label: string; key: string }
  | { kind: "post"; postIndex: number };

function dividerLabel(
  ymd: string,
  timezone: string,
  formatDate: (ymd: string) => string,
): string {
  const rel = getTenantRelativeDay(ymd, timezone);
  if (rel === "today") return "Today";
  if (rel === "yesterday") return "Yesterday";
  return formatDate(ymd);
}

export function buildFeedTimeline(
  posts: FeedTimelinePost[],
  timezone: string,
  formatDateLabel: (ymd: string) => string,
): FeedTimelineItem[] {
  const out: FeedTimelineItem[] = [];
  let lastYmd: string | null = null;

  posts.forEach((post, postIndex) => {
    const ymd = formatInTimeZone(new Date(post.created_at), timezone, "yyyy-MM-dd");
    if (ymd !== lastYmd) {
      out.push({
        kind: "day-divider",
        label: dividerLabel(ymd, timezone, formatDateLabel),
        key: `day-${ymd}`,
      });
      lastYmd = ymd;
    }
    out.push({ kind: "post", postIndex });
  });

  return out;
}
