import { describe, it, expect } from "vitest";
import { buildChatTimeline } from "./course-chat-timeline";

describe("buildChatTimeline", () => {
  const fd = (d: Date) => d.toLocaleDateString();
  const ft = (d: Date) => d.toTimeString().slice(0, 5);

  it("inserts date on day boundary", () => {
    const a = new Date("2026-04-20T10:00:00Z");
    const b = new Date("2026-04-21T10:00:00Z");
    const items = buildChatTimeline(
      [
        { id: 1, userId: 1, createdAt: a.toISOString() },
        { id: 2, userId: 1, createdAt: b.toISOString() },
      ],
      fd,
      ft
    );
    expect(items.filter((x) => x.kind === "date").length).toBe(2);
  });

  it("inserts time when gap >= 20 minutes same day", () => {
    const t0 = new Date("2026-04-20T10:00:00Z");
    const t1 = new Date("2026-04-20T10:25:00Z");
    const items = buildChatTimeline(
      [
        { id: 1, userId: 1, createdAt: t0.toISOString() },
        { id: 2, userId: 1, createdAt: t1.toISOString() },
      ],
      fd,
      ft
    );
    expect(items.some((x) => x.kind === "time")).toBe(true);
  });
});
