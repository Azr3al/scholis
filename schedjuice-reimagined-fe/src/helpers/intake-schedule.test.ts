import { describe, expect, it } from "vitest";
import {
  areRecurringSlotsValid,
  countIncludedCoursesWithNoSessions,
  formatRecurringSlotsDisplay,
  formatRecurringSlotsSummary,
  getEffectiveSlotsForRow,
  hasNoRecurringSessions,
  isValidRecurringSlot,
  recurringSlotTimeError,
} from "./intake-schedule";

describe("intake-schedule", () => {
  it("validates slot time ranges", () => {
    expect(
      isValidRecurringSlot({
        weekday: "Mon",
        time_from: "09:00",
        time_to: "10:00",
      }),
    ).toBe(true);
    expect(
      isValidRecurringSlot({
        weekday: "Mon",
        time_from: "10:00",
        time_to: "09:00",
      }),
    ).toBe(true);
  });

  it("rejects duplicate slots", () => {
    const slots = [
      { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
      { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
    ];
    expect(areRecurringSlotsValid(slots)).toBe(false);
  });

  it("formats slot summaries", () => {
    expect(
      formatRecurringSlotsSummary([
        { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
        { weekday: "Wed", time_from: "09:00", time_to: "10:00" },
      ]),
    ).toBe("Mon/Wed 09:00 – 10:00");
  });

  it("detects empty sessions", () => {
    expect(hasNoRecurringSessions([])).toBe(true);
    expect(
      hasNoRecurringSessions([
        { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
      ]),
    ).toBe(false);
  });

  it("formats display copy for empty and configured sessions", () => {
    expect(formatRecurringSlotsDisplay([])).toBe("No sessions configured");
    expect(
      formatRecurringSlotsDisplay([
        { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
      ]),
    ).toBe("Mon 09:00 – 10:00");
  });

  it("resolves effective slots per row", () => {
    const defaultSlots = [
      { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
    ];
    expect(getEffectiveSlotsForRow("a", defaultSlots, {})).toEqual(defaultSlots);
    expect(
      getEffectiveSlotsForRow("a", defaultSlots, { a: [] }),
    ).toEqual([]);
  });

  it("counts included courses with no sessions", () => {
    expect(
      countIncludedCoursesWithNoSessions(
        ["a", "b", "c"],
        { c: true },
        [],
        { b: [{ weekday: "Tue", time_from: "09:00", time_to: "10:00" }] },
      ),
    ).toBe(1);
  });
});

describe("intake-schedule overnight", () => {
  it("accepts overnight slots within 24h", () => {
    const slot = { weekday: "Mon", time_from: "22:30", time_to: "00:00" };
    expect(isValidRecurringSlot(slot)).toBe(true);
    expect(recurringSlotTimeError(slot)).toBeNull();
  });

  it("rejects zero-duration slots", () => {
    const slot = { weekday: "Mon", time_from: "10:00", time_to: "10:00" };
    expect(isValidRecurringSlot(slot)).toBe(false);
    expect(recurringSlotTimeError(slot)).toMatch(/after start time/i);
  });

  it("formats overnight summary with (+1)", () => {
    expect(
      formatRecurringSlotsSummary([
        { weekday: "Mon", time_from: "22:30", time_to: "00:00" },
      ]),
    ).toContain("(+1)");
  });
});
