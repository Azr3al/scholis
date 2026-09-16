import { describe, expect, it } from "vitest";
import { passwordRegex } from "@/types/user";
import { evaluatePasswordRequirements } from "./password-requirements";

describe("evaluatePasswordRequirements", () => {
  it("marks all unmet for empty string", () => {
    const r = evaluatePasswordRequirements("");
    expect(r).toEqual({
      minLength: false,
      number: false,
      lowercase: false,
      uppercase: false,
      special: false,
      allMet: false,
    });
  });

  it("detects each rule independently", () => {
    expect(evaluatePasswordRequirements("abcdefgh").minLength).toBe(true);
    expect(evaluatePasswordRequirements("1").number).toBe(true);
    expect(evaluatePasswordRequirements("a").lowercase).toBe(true);
    expect(evaluatePasswordRequirements("A").uppercase).toBe(true);
    expect(evaluatePasswordRequirements("#").special).toBe(true);
    expect(evaluatePasswordRequirements("_").special).toBe(false);
  });

  it("stays in parity with passwordRegex for representative cases", () => {
    const samples = [
      "",
      "short",
      "abcdefgh",
      "Abcdefgh",
      "Abcdefg1",
      "abcdef1#",
      "ABCDEF1#",
      "Abcdef1_",
      "Abcdef1#",
      "Password123$",
    ];
    for (const sample of samples) {
      const { allMet } = evaluatePasswordRequirements(sample);
      expect(allMet).toBe(passwordRegex.test(sample));
    }
  });
});
