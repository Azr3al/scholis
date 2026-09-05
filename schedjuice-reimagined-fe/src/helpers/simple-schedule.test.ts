import { describe, expect, it } from "vitest";
import {
  WD_WEEKDAYS,
  WE_WEEKDAYS,
  canCollapseSlotsToSimple,
  courseTypeForWeekdays,
  createDefaultSimpleValue,
  orgUsesWdWeNomenclature,
  resolveSessionDefaults,
  simpleValueToSlots,
  slotsToSimpleValue,
  weekdaysForCourseType,
} from "./simple-schedule";

describe("resolveSessionDefaults", () => {
  it("falls back to 19:00 and 90 minutes", () => {
    expect(resolveSessionDefaults(null)).toEqual({
      time_from: "19:00",
      time_to: "20:30",
      durationMinutes: 90,
    });
  });

  it("uses org overrides", () => {
    expect(
      resolveSessionDefaults({
        default_session_start_time: "18:00:00",
        default_session_duration_minutes: 60,
      }),
    ).toEqual({
      time_from: "18:00",
      time_to: "19:00",
      durationMinutes: 60,
    });
  });
});

describe("WD/WE maps", () => {
  it("maps WD and WE weekdays", () => {
    expect(weekdaysForCourseType("WD")).toEqual([...WD_WEEKDAYS]);
    expect(weekdaysForCourseType("WE")).toEqual([...WE_WEEKDAYS]);
  });

  it("detects exact sets only", () => {
    expect(courseTypeForWeekdays(["Mon", "Tue", "Wed", "Thu"])).toBe("WD");
    expect(courseTypeForWeekdays(["Mon", "Wed"])).toBeNull();
    expect(courseTypeForWeekdays(["Fri"])).toBeNull();
  });
});

describe("expand/collapse", () => {
  it("expands simple value to slots", () => {
    expect(
      simpleValueToSlots({
        weekdays: ["Wed", "Mon"],
        time_from: "19:00",
        time_to: "20:30",
        course_type: null,
      }),
    ).toEqual([
      { weekday: "Mon", time_from: "19:00", time_to: "20:30" },
      { weekday: "Wed", time_from: "19:00", time_to: "20:30" },
    ]);
  });

  it("collapses uniform slots", () => {
    const slots = [
      { weekday: "Mon", time_from: "19:00", time_to: "20:30" },
      { weekday: "Wed", time_from: "19:00", time_to: "20:30" },
    ];
    expect(slotsToSimpleValue(slots)).toEqual({
      weekdays: ["Mon", "Wed"],
      time_from: "19:00",
      time_to: "20:30",
      course_type: null,
    });
    expect(canCollapseSlotsToSimple(slots, false)).toBe(true);
  });

  it("rejects mixed times and Friday in WD/WE mode", () => {
    expect(
      canCollapseSlotsToSimple(
        [{ weekday: "Fri", time_from: "19:00", time_to: "20:30" }],
        true,
      ),
    ).toBe(false);
    expect(
      canCollapseSlotsToSimple(
        [
          { weekday: "Mon", time_from: "19:00", time_to: "20:30" },
          { weekday: "Wed", time_from: "18:00", time_to: "19:00" },
        ],
        false,
      ),
    ).toBe(false);
  });

  it("collapses exact WD set in WD/WE mode", () => {
    const slots = WD_WEEKDAYS.map((weekday) => ({
      weekday,
      time_from: "19:00",
      time_to: "20:30",
    }));
    expect(canCollapseSlotsToSimple(slots, true)).toBe(true);
    expect(slotsToSimpleValue(slots)?.course_type).toBe("WD");
  });
});

describe("orgUsesWdWeNomenclature", () => {
  it("is true only when the org WD/WE setting is enabled", () => {
    expect(orgUsesWdWeNomenclature(true)).toBe(true);
    expect(orgUsesWdWeNomenclature(false)).toBe(false);
    expect(orgUsesWdWeNomenclature(null)).toBe(false);
    expect(orgUsesWdWeNomenclature(undefined)).toBe(false);
  });
});

describe("createDefaultSimpleValue", () => {
  it("returns empty weekdays with default times", () => {
    expect(createDefaultSimpleValue(null)).toEqual({
      weekdays: [],
      time_from: "19:00",
      time_to: "20:30",
      course_type: null,
    });
  });
});
