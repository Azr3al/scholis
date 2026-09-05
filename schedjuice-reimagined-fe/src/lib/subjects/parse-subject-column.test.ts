import { describe, expect, it } from "vitest";
import {
  normalizeKey,
  parseSubjectColumn,
  stripSectionSuffix,
} from "./parse-subject-column";

const opts = { stripSections: true, titleCase: false, splitCommas: true };

describe("normalizeKey", () => {
  it("lowercases, collapses spaces, and unifies & / and", () => {
    expect(normalizeKey("Audit  &  Assurance")).toBe("audit and assurance");
    expect(normalizeKey("Audit and Assurance")).toBe("audit and assurance");
  });
});

describe("stripSectionSuffix", () => {
  it("removes trailing section markers", () => {
    expect(stripSectionSuffix("Dip IFR Section (A)")).toBe("Dip IFR");
    expect(stripSectionSuffix("Dip IFR Section B")).toBe("Dip IFR");
    expect(stripSectionSuffix("Maths - A")).toBe("Maths");
    expect(stripSectionSuffix("Physics (B)")).toBe("Physics");
    expect(stripSectionSuffix("History Sec 1")).toBe("History");
  });
  it("never reduces a name to empty", () => {
    expect(stripSectionSuffix("(A)")).toBe("(A)");
  });
});

describe("parseSubjectColumn", () => {
  it("drops a header row, trims, and dedupes case-insensitively", () => {
    const rows = parseSubjectColumn(
      "Subject\nDip IFR\n dip ifr \nTaxation",
      { stripSections: false, titleCase: false, splitCommas: true },
    );
    expect(rows.map((r) => r.name)).toEqual(["Dip IFR", "Taxation"]);
  });

  it("strips sections and counts merges", () => {
    const rows = parseSubjectColumn(
      "Section\nDip IFR Section (A)\nDip IFR Section (B)\nDip IFR Section (A)",
      opts,
    );
    expect(rows).toEqual([{ name: "Dip IFR", mergedCount: 3 }]);
  });

  it("splits tab-pasted cells and ignores blanks", () => {
    const rows = parseSubjectColumn(
      "Maths\tPhysics\n\n  \nChemistry",
      { stripSections: false, titleCase: false, splitCommas: true },
    );
    expect(rows.map((r) => r.name)).toEqual(["Maths", "Physics", "Chemistry"]);
  });

  it("merges & and 'and' variants", () => {
    const rows = parseSubjectColumn(
      "Audit & Assurance\nAudit and Assurance",
      { stripSections: false, titleCase: false, splitCommas: true },
    );
    expect(rows).toEqual([{ name: "Audit & Assurance", mergedCount: 2 }]);
  });

  it("splits comma-separated subjects in one cell when enabled", () => {
    const rows = parseSubjectColumn("BT, MA\nPM, AA", {
      stripSections: false,
      titleCase: false,
      splitCommas: true,
    });
    expect(rows.map((r) => r.name)).toEqual(["BT", "MA", "PM", "AA"]);
  });

  it("keeps comma-containing text as one subject when disabled", () => {
    const rows = parseSubjectColumn("PM, AA", {
      stripSections: false,
      titleCase: false,
      splitCommas: false,
    });
    expect(rows).toEqual([{ name: "PM, AA", mergedCount: 1 }]);
  });
});
