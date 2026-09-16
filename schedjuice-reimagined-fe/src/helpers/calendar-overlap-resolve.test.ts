import { describe, expect, it, vi } from "vitest";

vi.mock("mm-cal-js", () => ({
  isSabbath: () => 0,
}));

vi.mock("@/helpers/course-schedule", () => ({
  postScheduleResolveOverlaps: vi.fn(),
}));

import { eventType } from "@/types/course";

import { postScheduleResolveOverlaps } from "@/helpers/course-schedule";
import {
  applyResolveResultToEvents,
  resolveScheduleOverlaps,
} from "./calendar-overlap-resolve";

const baseEvent = (
  overrides: Partial<eventType> & { id: eventType["id"] }
): Partial<eventType> => ({
  title: "Session",
  date: "2026-07-07T00:00:00.000Z",
  time_from: "09:00:00",
  time_to: "10:30:00",
  ...overrides,
});

describe("applyResolveResultToEvents", () => {
  it("removes client delete draft ids", () => {
    const flat = [
      baseEvent({ id: "new-a" }),
      baseEvent({ id: "new-b", time_from: "09:30:00", time_to: "11:00:00" }),
    ];
    const result = applyResolveResultToEvents(flat, {
      client_deletes: ["new-b"],
      deferred_merges: [],
      applied: {
        events_removed: [],
        events_kept: [],
        users_merged_count: 0,
      },
      events: [],
    });
    expect(result.events.map((e) => e.id)).toEqual(["new-a"]);
  });
});

describe("resolveScheduleOverlaps", () => {
  it("all-draft cluster skips API call", async () => {
    vi.mocked(postScheduleResolveOverlaps).mockClear();
    const flat = [
      baseEvent({ id: "new-a" }),
      baseEvent({ id: "new-b", time_from: "09:30:00", time_to: "11:00:00" }),
    ];
    const result = await resolveScheduleOverlaps({
      courseId: 1,
      flatEvents: flat,
      mode: "auto_global",
    });
    expect(postScheduleResolveOverlaps).not.toHaveBeenCalled();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("new-a");
  });

  it("calls API when persisted event in cluster", async () => {
    vi.mocked(postScheduleResolveOverlaps).mockResolvedValue({
      client_deletes: [],
      deferred_merges: [],
      applied: {
        events_removed: [2],
        events_kept: [1],
        users_merged_count: 0,
      },
      events: [
        {
          id: 1,
          title: "Kept",
          date: "2026-07-07T00:00:00.000Z",
          time_from: "09:00:00",
          time_to: "10:30:00",
        },
      ],
    });
    const flat = [
      baseEvent({ id: 1 }),
      baseEvent({ id: 2, time_from: "09:30:00", time_to: "11:00:00" }),
    ];
    const result = await resolveScheduleOverlaps({
      courseId: 5,
      flatEvents: flat,
      mode: "auto_global",
    });
    expect(postScheduleResolveOverlaps).toHaveBeenCalledOnce();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe(1);
  });

  it("stores deferred merges from API", async () => {
    vi.mocked(postScheduleResolveOverlaps).mockResolvedValue({
      client_deletes: [],
      deferred_merges: [
        { survivor_draft_id: "new-x", source_event_ids: [9] },
      ],
      applied: {
        events_removed: [],
        events_kept: [],
        users_merged_count: 0,
      },
      events: [{ id: 9, title: "Old", date: "2026-07-07", time_from: "09:00:00", time_to: "10:00:00" }],
    });
    const flat = [baseEvent({ id: 9, time_from: "09:00:00", time_to: "10:30:00" })];
    const result = await resolveScheduleOverlaps({
      courseId: 5,
      flatEvents: flat,
      mode: "pin_survivor",
      pinSurvivor: {
        draftId: "new-x",
        localDate: "2026-07-07",
        removeEventIds: [9],
        removeDraftIds: [],
      },
      extraDraftEvents: [
        baseEvent({ id: "new-x", time_from: "09:30:00", time_to: "11:00:00" }),
      ],
    });
    expect(result.deferredMerges).toHaveLength(1);
  });
});
