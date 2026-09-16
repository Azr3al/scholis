import { describe, expect, it } from "vitest";

import {
  formatMyanmarDateline,
  formatSabbathSuffix,
  formatTraditionalMyanmarDate,
} from "./myanmar-date-format";

describe("formatTraditionalMyanmarDate", () => {
  it("formats 2024-01-01 without era clauses", () => {
    const wall = new Date("2024-01-01T12:00:00+06:30");
    expect(formatTraditionalMyanmarDate(wall, "Asia/Yangon")).toBe(
      "နတ်တော် လဆုတ် ၅ ရက် တနင်္လာနေ့",
    );
    expect(formatSabbathSuffix(wall)).toBe("");
  });

  it("appends Sabbath suffix when isSabbath returns 1", () => {
    const sabbath = new Date("2024-01-04T12:00:00+06:30");
    expect(formatSabbathSuffix(sabbath)).toBe(" · ဥပုသ်");
    expect(formatMyanmarDateline(sabbath, "Asia/Yangon")).toContain(" · ဥပုသ်");
  });

  it("appends Sabbath eve suffix when isSabbath returns 2", () => {
    const eve = new Date("2024-01-03T12:00:00+06:30");
    expect(formatSabbathSuffix(eve)).toBe(" · အဖိတ်");
  });
});
