import { describe, expect, it } from "vitest";

import {
  OCR_READ_ERROR_MESSAGE,
  parseDuplicatePaymentId,
  parseOcrString,
  parseSuggestedPaymentMethodId,
} from "@/lib/finances/ocr-payment-screenshot";

describe("ocr-payment-screenshot helpers", () => {
  it("parseOcrString returns empty string for nullish values", () => {
    expect(parseOcrString(null)).toBe("");
    expect(parseOcrString(undefined)).toBe("");
    expect(parseOcrString("12345")).toBe("12345");
  });

  it("parseDuplicatePaymentId rejects invalid ids", () => {
    expect(parseDuplicatePaymentId(null)).toBeNull();
    expect(parseDuplicatePaymentId("")).toBeNull();
    expect(parseDuplicatePaymentId("abc")).toBeNull();
    expect(parseDuplicatePaymentId(42)).toBe(42);
  });

  it("parseSuggestedPaymentMethodId rejects invalid ids", () => {
    expect(parseSuggestedPaymentMethodId(null)).toBe("");
    expect(parseSuggestedPaymentMethodId("")).toBe("");
    expect(parseSuggestedPaymentMethodId("abc")).toBe("");
    expect(parseSuggestedPaymentMethodId(0)).toBe("");
    expect(parseSuggestedPaymentMethodId(12)).toBe("12");
  });

  it("exposes a stable manual-entry OCR error message", () => {
    expect(OCR_READ_ERROR_MESSAGE).toMatch(/enter manually/i);
  });
});
