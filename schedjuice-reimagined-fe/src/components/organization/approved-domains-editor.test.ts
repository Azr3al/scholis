import { describe, expect, it } from "vitest";
import { normalizeApprovedDomain } from "./approved-domains-editor";

describe("normalizeApprovedDomain", () => {
  it("trims and lowercases hostnames", () => {
    expect(normalizeApprovedDomain("  School.EDU ")).toBe("school.edu");
  });

  it("extracts domain from email addresses", () => {
    expect(normalizeApprovedDomain("teacher@School.EDU")).toBe("school.edu");
  });

  it("rejects empty input", () => {
    expect(normalizeApprovedDomain("   ")).toBeNull();
  });
});
