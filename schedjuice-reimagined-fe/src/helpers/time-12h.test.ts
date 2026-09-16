import { describe, expect, it } from "vitest";
import {
  hhmmTo12HourSegments,
  segmentsToHhmm,
  timeValueTo12HourSegments,
} from "@/helpers/time-12h";
import { stringToTimeValue } from "@/helpers/date";

describe("time-12h helpers", () => {
  describe("hhmmTo12HourSegments", () => {
    it("converts afternoon time", () => {
      expect(hhmmTo12HourSegments("14:30")).toEqual({
        hour: "2",
        minute: "30",
        period: "PM",
      });
    });

    it("converts midnight", () => {
      expect(hhmmTo12HourSegments("00:00")).toEqual({
        hour: "12",
        minute: "00",
        period: "AM",
      });
    });

    it("converts noon", () => {
      expect(hhmmTo12HourSegments("12:00")).toEqual({
        hour: "12",
        minute: "00",
        period: "PM",
      });
    });

    it("returns null segments for empty input", () => {
      expect(hhmmTo12HourSegments(null)).toEqual({
        hour: null,
        minute: null,
        period: null,
      });
    });
  });

  describe("segmentsToHhmm", () => {
    it("converts PM time", () => {
      expect(segmentsToHhmm("2", "30", "PM")).toBe("14:30");
    });

    it("converts midnight", () => {
      expect(segmentsToHhmm("12", "00", "AM")).toBe("00:00");
    });

    it("converts noon", () => {
      expect(segmentsToHhmm("12", "00", "PM")).toBe("12:00");
    });
  });

  describe("round-trip", () => {
    it("segments -> HH:mm -> segments", () => {
      const original = { hour: "2", minute: "30", period: "PM" as const };
      const hhmm = segmentsToHhmm(original.hour, original.minute, original.period);
      expect(hhmmTo12HourSegments(hhmm)).toEqual(original);
    });
  });

  describe("timeValueTo12HourSegments", () => {
    it("matches hhmm conversion for TimeValue", () => {
      const time = stringToTimeValue("14:30");
      expect(timeValueTo12HourSegments(time)).toEqual(
        hhmmTo12HourSegments("14:30"),
      );
    });
  });
});
