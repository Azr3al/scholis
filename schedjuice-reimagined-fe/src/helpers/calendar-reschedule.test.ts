import { describe, expect, it } from "vitest";
import { eventType } from "@/types/course";
import {
  applySharedTimesToEvents,
  rescheduleClearsOverlaps,
  validateRescheduleTimes,
} from "./calendar-reschedule";

const baseEvent = (
  overrides: Partial<eventType> & { id: eventType["id"] }
): Partial<eventType> => ({
  title: "Session",
  date: "2026-07-07",
  time_from: "09:00:00",
  time_to: "10:00:00",
  ...overrides,
});

describe("applySharedTimesToEvents", () => {
  it("applies the same times to all conflict ids", () => {
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
      baseEvent({ id: 2, time_from: "09:30:00", time_to: "10:30:00" }),
      baseEvent({ id: 3, time_from: "14:00:00", time_to: "15:00:00" }),
    ];
    const next = applySharedTimesToEvents(flat, [1, 2], "11:00:00", "12:00:00");
    expect(next.find((e) => e.id === 1)?.time_from).toBe("11:00:00");
    expect(next.find((e) => e.id === 2)?.time_to).toBe("12:00:00");
    expect(next.find((e) => e.id === 3)?.time_from).toBe("14:00:00");
    expect(next.find((e) => e.id === 1)?.is_edit).toBe(true);
  });
});

describe("rescheduleClearsOverlaps", () => {
  it("returns true when no future overlaps remain", () => {
    const flat = [
      baseEvent({ id: 1, time_from: "09:00:00", time_to: "10:00:00" }),
      baseEvent({ id: 2, time_from: "11:00:00", time_to: "12:00:00" }),
    ];
    expect(rescheduleClearsOverlaps(flat)).toBe(true);
  });
});

describe("validateRescheduleTimes", () => {
  it("rejects zero-duration ranges", () => {
    expect(validateRescheduleTimes("10:00", "10:00")).toMatch(/after/i);
  });

  it("allows overnight ranges", () => {
    expect(validateRescheduleTimes("22:30", "00:00")).toBeNull();
  });
});
