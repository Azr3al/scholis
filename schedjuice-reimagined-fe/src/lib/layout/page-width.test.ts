import { describe, expect, it } from "vitest";
import { resolvePageWidthClass } from "./page-width";

describe("resolvePageWidthClass", () => {
  it("returns no max-width for the full tier", () => {
    expect(resolvePageWidthClass("full", false)).toBe("");
  });

  it("forces full width when fullscreen is active, ignoring the tier", () => {
    expect(resolvePageWidthClass("narrow", true)).toBe("");
    expect(resolvePageWidthClass("wide", true)).toBe("");
    expect(resolvePageWidthClass("default", true)).toBe("");
  });
});
