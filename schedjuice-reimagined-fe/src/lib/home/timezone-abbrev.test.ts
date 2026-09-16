import { describe, expect, it } from "vitest";

import { formatTimezoneAbbrev } from "./timezone-abbrev";

describe("formatTimezoneAbbrev", () => {
  it("maps Yangon/Rangoon to MMT", () => {
    expect(formatTimezoneAbbrev("Asia/Yangon")).toBe("MMT");
    expect(formatTimezoneAbbrev("Asia/Rangoon")).toBe("MMT");
  });

  it("returns a non-empty label for other zones", () => {
    expect(formatTimezoneAbbrev("Asia/Bangkok").length).toBeGreaterThan(0);
  });
});
