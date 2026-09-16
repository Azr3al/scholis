import { describe, expect, it } from "vitest";

import {
  OCR_READ_ERROR_MESSAGE,
  parseDuplicatePaymentId,
  parseOcrString,
  parseOcrStudentMatch,
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

  it("exposes a stable manual-entry OCR fallback message", () => {
    expect(OCR_READ_ERROR_MESSAGE).toMatch(/auto-fill/i);
    expect(OCR_READ_ERROR_MESSAGE).toMatch(/review|complete/i);
  });

  it("parseOcrStudentMatch maps auto match fields", () => {
    expect(
      parseOcrStudentMatch({
        notes_text: "Zayar Lin San KET",
        suggested_student_id: 42,
        student_match_kind: "auto",
        student_match_score: 100,
        student_match_candidates: [],
      }),
    ).toEqual({
      notesText: "Zayar Lin San KET",
      suggestedStudentId: "42",
      studentMatchKind: "auto",
      studentMatchScore: 100,
      studentMatchCandidates: [],
    });
  });
});
