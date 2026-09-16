import { describe, expect, it } from "vitest";
import { filterTimeline } from "./timeline";
import type { LogTimelineEvent } from "@/types/user-log";

const ev = (level: "MAJOR" | "DETAIL", id: number): LogTimelineEvent => ({
  id,
  event_type: "edited",
  level,
  payload: {},
  actor: null,
  created_at: new Date(id).toISOString(),
});

describe("filterTimeline", () => {
  it("hides DETAIL events when showDetail is false", () => {
    const events = [ev("MAJOR", 1), ev("DETAIL", 2)];
    expect(filterTimeline(events, false).map((e) => e.id)).toEqual([1]);
  });

});
