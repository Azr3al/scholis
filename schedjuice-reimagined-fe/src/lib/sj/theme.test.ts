// src/lib/sj/theme.test.ts
import { describe, expect, it } from "vitest";
import { normalizeTheme, isThemePreference } from "./theme";

describe("normalizeTheme", () => {
  it("returns system for invalid values", () => {
    expect(normalizeTheme("bogus")).toBe("system");
  });

  it("returns system for JSON org-theme cookie payloads", () => {
    expect(normalizeTheme('{"primary":"#000"}')).toBe("system");
  });

  it("accepts light dark system", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(isThemePreference("light")).toBe(true);
  });
});
