import { describe, expect, it } from "vitest";

import { formatHomeDatetimeLines } from "./format-home-datetime";

describe("formatHomeDatetimeLines", () => {
  const now = new Date("2024-01-01T16:00:00+06:30");

  it("formats Gregorian line with lowercase pm and MMT", () => {
    const { gregorian } = formatHomeDatetimeLines({
      now,
      timeZone: "Asia/Yangon",
      timeFormat: "12h",
    });
    expect(gregorian).toMatch(/MMT$/);
    expect(gregorian.toLowerCase()).toContain("pm");
    expect(gregorian).not.toMatch(/ PM/);
  });

  it("formats Myanmar line without era clauses", () => {
    const { myanmar } = formatHomeDatetimeLines({
      now,
      timeZone: "Asia/Yangon",
      timeFormat: "12h",
    });
    expect(myanmar).toBe("နတ်တော် လဆုတ် ၅ ရက် တနင်္လာနေ့");
    expect(myanmar).not.toContain("သာသနာ");
  });
});
