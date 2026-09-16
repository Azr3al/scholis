import { describe, expect, it } from "vitest";
import {
  canCollapseWhitelistSchedule,
  CONSULTATION_DEFAULT_WINDOW,
  normalizeWhitelistSchedule,
  scheduleToSimpleValue,
  simpleValueToSchedule,
  validateWhitelistSchedule,
} from "@/lib/consultation/whitelist-schedule";
import type { ConsultationWeekdayKey } from "@/types/consultation";

function day(
  enabled: boolean,
  windows: Array<{ start: string; end: string }> = [],
) {
  return { enabled, windows };
}

function lwtpSchedule() {
  const entry = day(true, [CONSULTATION_DEFAULT_WINDOW]);
  return Object.fromEntries(
    (
      [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ] as ConsultationWeekdayKey[]
    ).map((key) => [key, entry]),
  ) as Record<ConsultationWeekdayKey, ReturnType<typeof day>>;
}

describe("scheduleToSimpleValue", () => {
  it("collapses LWTP-like uniform schedule", () => {
    const simple = scheduleToSimpleValue(lwtpSchedule());
    expect(simple).not.toBeNull();
    expect(simple?.weekdays).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(simple?.time_from).toBe("18:00");
    expect(simple?.time_to).toBe("20:00");
  });

  it("returns empty simple value for all-disabled schedule", () => {
    const schedule = normalizeWhitelistSchedule({});
    const simple = scheduleToSimpleValue(schedule);
    expect(simple).toEqual({
      weekdays: [],
      time_from: "18:00",
      time_to: "20:00",
      course_type: null,
    });
  });

  it("returns null when enabled days have different hours", () => {
    const schedule = normalizeWhitelistSchedule({
      wednesday: day(true, [{ start: "18:00", end: "23:00" }]),
      thursday: day(true, [{ start: "18:00", end: "23:59" }]),
      friday: day(true, [{ start: "18:00", end: "20:00" }]),
    });
    expect(scheduleToSimpleValue(schedule)).toBeNull();
  });

  it("returns null when a day has multiple windows", () => {
    const schedule = normalizeWhitelistSchedule({
      monday: day(true, [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "17:00" },
      ]),
    });
    expect(scheduleToSimpleValue(schedule)).toBeNull();
  });
});

describe("simpleValueToSchedule", () => {
  it("round-trips a uniform schedule", () => {
    const simple = scheduleToSimpleValue(lwtpSchedule());
    expect(simple).not.toBeNull();
    const rebuilt = simpleValueToSchedule(simple!);
    expect(canCollapseWhitelistSchedule(rebuilt)).toBe(true);
    expect(scheduleToSimpleValue(rebuilt)).toEqual(simple);
  });

  it("maps selected weekdays to enabled days with one window", () => {
    const schedule = simpleValueToSchedule({
      weekdays: ["Mon", "Wed", "Fri"],
      time_from: "18:00",
      time_to: "20:00",
      course_type: null,
    });
    expect(schedule.monday.enabled).toBe(true);
    expect(schedule.wednesday.enabled).toBe(true);
    expect(schedule.friday.enabled).toBe(true);
    expect(schedule.tuesday.enabled).toBe(false);
    expect(schedule.monday.windows).toEqual([
      { start: "18:00", end: "20:00" },
    ]);
  });
});

describe("validateWhitelistSchedule", () => {
  it("rejects end before start", () => {
    const schedule = normalizeWhitelistSchedule({
      monday: day(true, [{ start: "20:00", end: "18:00" }]),
    });
    const errors = validateWhitelistSchedule(schedule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.day).toBe("monday");
    expect(errors[0]?.message).toMatch(/after start/i);
  });

  it("ignores disabled days", () => {
    const schedule = normalizeWhitelistSchedule({
      monday: day(false, [{ start: "20:00", end: "18:00" }]),
    });
    expect(validateWhitelistSchedule(schedule)).toHaveLength(0);
  });
});
