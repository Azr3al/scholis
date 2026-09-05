import { describe, expect, it } from "vitest";
import {
  normalizeInternalTenantId,
  parseInternalTenantId,
} from "./useInternalTenant";

describe("normalizeInternalTenantId", () => {
  it("returns null for empty or whitespace", () => {
    expect(normalizeInternalTenantId("")).toBeNull();
    expect(normalizeInternalTenantId("   ")).toBeNull();
  });
});

describe("parseInternalTenantId", () => {
  it("returns null for empty or invalid tenantId", () => {
    expect(parseInternalTenantId("")).toBeNull();
    expect(parseInternalTenantId("   ")).toBeNull();
    expect(parseInternalTenantId("abc")).toBeNull();
    expect(parseInternalTenantId("42abc")).toBeNull();
  });

  it("returns a number for numeric tenantId", () => {
    expect(parseInternalTenantId("42")).toBe(42);
    expect(parseInternalTenantId("  42  ")).toBe(42);
  });
});
