import type { LogTimelineEvent } from "@/types/user-log";

export function filterTimeline(
  events: LogTimelineEvent[],
  showDetail: boolean,
): LogTimelineEvent[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return showDetail ? sorted : sorted.filter((e) => e.level === "MAJOR");
}
