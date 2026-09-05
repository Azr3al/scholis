import { describe, expect, it } from "vitest";
import {
  isOvernightSession,
  isValidSessionTimeRange,
  requiresOvernightConfirmation,
  sessionDurationMinutes,
  validateSessionTimeRange,
} from "./session-time";

describe("sessionDurationMinutes", () => {
  it("computes same-day duration", () => {
    expect(sessionDurationMinutes("09:00", "10:30")).toBe(90);
  });

  it("computes overnight duration", () => {
    expect(sessionDurationMinutes("22:30", "00:00")).toBe(90);
    expect(isOvernightSession("22:30", "00:00")).toBe(true);
  });
});

describe("isValidSessionTimeRange", () => {
  it("rejects zero duration", () => {
    expect(isValidSessionTimeRange("10:00", "10:00")).toBe(false);
  });

  it("allows overnight under 24h", () => {
    expect(isValidSessionTimeRange("22:30", "00:00")).toBe(true);
  });
});

describe("requiresOvernightConfirmation", () => {
  it("is false for short overnight", () => {
    expect(requiresOvernightConfirmation("22:30", "00:00")).toBe(false);
  });

  it("is true for long overnight", () => {
    expect(requiresOvernightConfirmation("23:00", "08:00")).toBe(true);
  });
});

describe("validateSessionTimeRange", () => {
  it("returns null for valid overnight", () => {
    expect(validateSessionTimeRange("22:30", "00:00")).toBeNull();
  });

  it("returns error for zero duration", () => {
    expect(validateSessionTimeRange("10:00", "10:00")).toBe(
      "End time must be after start time"
    );
  });
});
