import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";

import { getTenantMonthBoundariesIso } from "./shortcuts-time";

describe("getTenantMonthBoundariesIso", () => {
  it("returns full June 2025 in Asia/Rangoon", () => {
    const anchor = new Date(2025, 5, 15);
    const { startIso, endIso } = getTenantMonthBoundariesIso("Asia/Rangoon", anchor);
    expect(formatInTimeZone(startIso, "Asia/Rangoon", "yyyy-MM-dd")).toBe(
      "2025-06-01",
    );
    expect(formatInTimeZone(endIso, "Asia/Rangoon", "yyyy-MM-dd")).toBe(
      "2025-06-30",
    );
    expect(new Date(startIso).getTime()).toBeLessThan(new Date(endIso).getTime());
  });
});
