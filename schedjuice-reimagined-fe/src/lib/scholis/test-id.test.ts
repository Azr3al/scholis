import { describe, expect, it } from "vitest";

import { extractTestId, hasTestId } from "./test-id";

const ID = "3f7a1c2e-9b44-4d18-a6f0-2c8e51d90ab7";

describe("extractTestId", () => {
  it("returns a bare id unchanged", () => {
    expect(extractTestId(ID)).toBe(ID);
  });

  it("trims surrounding whitespace", () => {
    // The common case: a paste that picked up a newline or a trailing space.
    expect(extractTestId(`  ${ID}\n`)).toBe(ID);
  });

  it("picks the id out of a Scholis paper URL", () => {
    expect(extractTestId(`https://scholis.test/papers/${ID}`)).toBe(ID);
    expect(extractTestId(`https://scholis.test/papers/${ID}/questions`)).toBe(ID);
  });

  it("ignores a query string and fragment", () => {
    expect(extractTestId(`https://scholis.test/p/${ID}?tab=preview#top`)).toBe(ID);
  });

  it("picks the id out of prose", () => {
    expect(extractTestId(`The paper is ${ID}, thanks`)).toBe(ID);
  });

  it("normalises case so one paper is not shown as two", () => {
    expect(extractTestId(ID.toUpperCase())).toBe(ID);
    expect(extractTestId(`https://scholis.test/p/${ID.toUpperCase()}`)).toBe(ID);
  });

  it("takes the first id when there is more than one", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    expect(extractTestId(`${ID} and also ${other}`)).toBe(ID);
  });

  it("returns empty for input with no id in it", () => {
    for (const input of [
      "",
      "   ",
      "midterm exam",
      "https://scholis.test/papers",
      // One group short: looks like an id at a glance, and accepting it would
      // bind a paper that does not exist.
      "3f7a1c2e-9b44-4d18-a6f0",
      "not-a-uuid-at-all",
    ]) {
      expect(extractTestId(input), JSON.stringify(input)).toBe("");
    }
  });

  it("extracts a leading id even when more text follows it", () => {
    // Not anchored, on purpose: this is the same substring behaviour that makes
    // prose and URLs work. A trailing slug is not a reason to refuse an id that
    // is plainly there.
    expect(extractTestId(`${ID}-extra`)).toBe(ID);
  });

  it("rejects non-hexadecimal characters in the right shape", () => {
    // Correct grouping, invalid characters.
    expect(extractTestId("zzzzzzzz-9b44-4d18-a6f0-2c8e51d90ab7")).toBe("");
  });
});

describe("hasTestId", () => {
  it("is true only when an id can be extracted", () => {
    expect(hasTestId(ID)).toBe(true);
    expect(hasTestId(`https://scholis.test/p/${ID}`)).toBe(true);
    expect(hasTestId("")).toBe(false);
    expect(hasTestId("midterm")).toBe(false);
  });
});
