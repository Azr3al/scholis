import { describe, expect, it } from "vitest";

import { containsMyanmar } from "./script";

describe("containsMyanmar", () => {
  it("detects Myanmar inside a mixed-script string", () => {
    // The common case per DESIGN.md §7: Burmese and Latin on the same line.
    expect(containsMyanmar("အောင်ဇေယျ submitted Quiz 4")).toBe(true);
  });

  it("does not fire on Latin, digits, or empty input", () => {
    expect(containsMyanmar("Good morning, Thiha")).toBe(false);
    expect(containsMyanmar("2026-05-29")).toBe(false);
    expect(containsMyanmar("")).toBe(false);
    expect(containsMyanmar(null)).toBe(false);
  });

  it("covers the Myanmar Extended blocks in the font unicode-range", () => {
    expect(containsMyanmar("\uA9E0")).toBe(true);
    expect(containsMyanmar("\uAA60")).toBe(true);
  });
});
