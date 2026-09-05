import { describe, expect, it } from "vitest";
import { isLegalEmail, isPlausiblePhone } from "@/lib/imports/validation";

describe("isLegalEmail", () => {
  it("rejects spaces, double dots, leading/trailing dots, missing tld", () => {
    expect(isLegalEmail("a b@example.com")).toBe(false);
    expect(isLegalEmail("a..b@example.com")).toBe(false);
    expect(isLegalEmail(".a@example.com")).toBe(false);
    expect(isLegalEmail("a.@example.com")).toBe(false);
    expect(isLegalEmail("a@example")).toBe(false);
  });
});

describe("isPlausiblePhone", () => {
  it("needs at least 6 digits", () => {
    expect(isPlausiblePhone("+95 9 123 456")).toBe(true);
    expect(isPlausiblePhone("12")).toBe(false);
    expect(isPlausiblePhone("")).toBe(false);
  });
});
