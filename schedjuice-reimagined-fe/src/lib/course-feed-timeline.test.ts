import { describe, expect, it } from "vitest";

import { buildFeedTimeline } from "./course-feed-timeline";

describe("buildFeedTimeline", () => {
  it("inserts day divider when dates differ", () => {
    const posts = [
      { id: 1, created_at: "2025-06-15T10:00:00Z" },
      { id: 2, created_at: "2025-06-14T10:00:00Z" },
    ];
    const items = buildFeedTimeline(posts, "UTC", (ymd) => ymd);
    expect(items.filter((i) => i.kind === "day-divider")).toHaveLength(2);
    expect(items.filter((i) => i.kind === "post")).toHaveLength(2);
  });

  it("uses single divider for same-day posts", () => {
    const posts = [
      { id: 1, created_at: "2025-06-15T10:00:00Z" },
      { id: 2, created_at: "2025-06-15T18:00:00Z" },
    ];
    const items = buildFeedTimeline(posts, "UTC", (ymd) => ymd);
    expect(items.filter((i) => i.kind === "day-divider")).toHaveLength(1);
  });
});
