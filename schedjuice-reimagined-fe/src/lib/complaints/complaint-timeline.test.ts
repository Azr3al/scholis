import { describe, expect, it } from "vitest";

import { mapComplaintTimelineToBubbles } from "@/lib/complaints/complaint-timeline";
import type { IssueTimelineItem } from "@/types/issue";

describe("mapComplaintTimelineToBubbles", () => {
  it("marks own comments as isMe and passes attachments", () => {
    const items: IssueTimelineItem[] = [
      {
        kind: "comment",
        id: 5,
        body: "Hello",
        actor: { id: 42, name: "Student", email: "s@example.com" },
        created_at: "2026-01-01T00:00:00Z",
        attachments: [{ attachment_id: 9, name: "photo.jpg", mime_type: "image/jpeg", size_bytes: 0 }],
      },
    ];
    const bubbles = mapComplaintTimelineToBubbles(items, 42);
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].isMe).toBe(true);
    expect(bubbles[0].attachments).toEqual([
      { attachment_id: 9, name: "photo.jpg", mime_type: "image/jpeg", size_bytes: 0 },
    ]);
  });

  it("maps staff comments as not isMe", () => {
    const items: IssueTimelineItem[] = [
      {
        kind: "comment",
        id: 6,
        body: "Reply",
        actor: { id: 1, name: "Admin", email: "a@example.com" },
        created_at: "2026-01-01T00:01:00Z",
        attachments: [],
      },
    ];
    const bubbles = mapComplaintTimelineToBubbles(items, 42);
    expect(bubbles[0].isMe).toBe(false);
    expect(bubbles[0].isSystem).toBe(false);
  });

  it("maps system events with student-friendly labels", () => {
    const items: IssueTimelineItem[] = [
      {
        kind: "event",
        id: 1,
        event_type: "created",
        payload: {},
        actor: null,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        kind: "event",
        id: 2,
        event_type: "status_changed",
        payload: { from: "Open", to: "Done" },
        actor: { id: 1, name: "Admin", email: "a@example.com" },
        created_at: "2026-01-02T00:00:00Z",
      },
      {
        kind: "event",
        id: 3,
        event_type: "status_changed",
        payload: { from: "Done", to: "Open" },
        actor: { id: 42, name: "Student", email: "s@example.com" },
        created_at: "2026-01-03T00:00:00Z",
      },
    ];
    const bubbles = mapComplaintTimelineToBubbles(items, 42);
    expect(bubbles.map((b) => b.systemLabel)).toEqual([
      "Complaint submitted",
      "Your complaint was marked resolved",
      "Your complaint was reopened",
    ]);
    expect(bubbles.every((b) => b.isSystem)).toBe(true);
  });
});
