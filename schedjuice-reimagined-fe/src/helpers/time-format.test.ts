import { describe, expect, it } from "vitest";
import { formatOverlapSessionTime } from "./course-insights";
import {
  formatOrgTime,
  formatOrgTimeRange,
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "./time-format";

describe("resolveTimeDisplayFormat", () => {
  it("defaults unknown to 12h", () => {
    expect(resolveTimeDisplayFormat(undefined)).toBe("12h");
    expect(resolveTimeDisplayFormat("nope")).toBe("12h");
  });
  it("accepts 24h", () => {
    expect(resolveTimeDisplayFormat("24h")).toBe("24h");
  });
});

describe("formatOrgTime", () => {
  it("formats midnight and noon in 12h", () => {
    expect(formatOrgTime("00:00", "12h")).toBe("12:00 AM");
    expect(formatOrgTime("12:00", "12h")).toBe("12:00 PM");
  });
  it("formats afternoon in 12h and 24h", () => {
    expect(formatOrgTime("19:30", "12h")).toBe("07:30 PM");
    expect(formatOrgTime("19:30", "24h")).toBe("19:30");
  });
  it("accepts HH:mm:ss", () => {
    expect(formatOrgTime("09:05:00", "24h")).toBe("09:05");
  });
});

describe("formatOrgTimeRange", () => {
  it("joins with en dash", () => {
    expect(formatOrgTimeRange("19:00", "20:30", "12h")).toBe(
      "07:00 PM – 08:30 PM",
    );
  });
});

describe("orgTimeDateFnsPattern", () => {
  it("maps org format to date-fns patterns", () => {
    expect(orgTimeDateFnsPattern("12h")).toBe("hh:mm a");
    expect(orgTimeDateFnsPattern("24h")).toBe("HH:mm");
  });
});

describe("formatOverlapSessionTime", () => {
  it("honors format like formatOrgTime", () => {
    expect(formatOverlapSessionTime("19:30", "12h")).toBe("07:30 PM");
    expect(formatOverlapSessionTime("19:30", "24h")).toBe("19:30");
  });
});
