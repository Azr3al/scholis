import { describe, expect, it } from "vitest";
import { formatCheckinOpensAt } from "./checkin-window";

describe("formatCheckinOpensAt", () => {
  it("uses 12h pattern by default", () => {
    // 12:30 UTC → 19:00 Asia/Yangon
    expect(
      formatCheckinOpensAt("2026-07-21T12:30:00.000Z", "Asia/Yangon"),
    ).toBe("07:00 PM");
  });

  it("uses 24h pattern when format is 24h", () => {
    expect(
      formatCheckinOpensAt("2026-07-21T12:30:00.000Z", "Asia/Yangon", "24h"),
    ).toBe("19:00");
  });
});
