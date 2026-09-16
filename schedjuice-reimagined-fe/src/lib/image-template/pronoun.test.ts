import { describe, expect, it } from "vitest";
import { pronounForGender } from "./pronoun";

describe("pronounForGender", () => {
  it("maps gender to subject pronouns", () => {
    expect(pronounForGender("MALE")).toBe("he");
    expect(pronounForGender("FEMALE")).toBe("she");
    expect(pronounForGender("NON_BINARY")).toBe("they");
    expect(pronounForGender("OTHER")).toBe("they");
    expect(pronounForGender(null)).toBe("they");
    expect(pronounForGender(undefined)).toBe("they");
  });
});
