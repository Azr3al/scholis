import { describe, expect, it } from "vitest";
import { isSuspiciousContact } from "./suspicious-contact";

describe("isSuspiciousContact", () => {
  it("flags blocklisted phone 0900000", () => {
    expect(isSuspiciousContact("0900000", "phone")).toBe(true);
    expect(isSuspiciousContact("09-000-0000", "phone")).toBe(true);
  });

  it("flags all-same-digit phones", () => {
    expect(isSuspiciousContact("1111111", "phone")).toBe(true);
  });

  it("flags short phones", () => {
    expect(isSuspiciousContact("12345", "phone")).toBe(true);
  });

  it("accepts valid phones", () => {
    expect(isSuspiciousContact("959123456789", "phone")).toBe(false);
  });

  it("flags blocklisted emails", () => {
    expect(isSuspiciousContact("test@test.com", "communication_email")).toBe(true);
  });

  it("flags lazy email local parts", () => {
    expect(isSuspiciousContact("noreply@school.edu", "communication_email")).toBe(
      true
    );
  });

  it("accepts valid emails", () => {
    expect(isSuspiciousContact("family@gmail.com", "communication_email")).toBe(
      false
    );
  });

  it("returns false for empty values", () => {
    expect(isSuspiciousContact("", "phone")).toBe(false);
    expect(isSuspiciousContact("   ", "communication_email")).toBe(false);
  });

  it("treats emergency_phone like phone", () => {
    expect(isSuspiciousContact("0000000", "emergency_phone")).toBe(true);
  });
});
