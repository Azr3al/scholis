import { describe, expect, it } from "vitest";

import { gridToPastePayload, trimGridCells } from "./grid-to-paste";

describe("trimGridCells", () => {
  it("returns empty array for all-blank grid", () => {
    expect(trimGridCells([["", ""], ["", ""]])).toEqual([]);
  });

  it("trims trailing blank rows and columns", () => {
    expect(
      trimGridCells([
        ["Name", "Score", ""],
        ["Ada", "90", ""],
        ["", "", ""],
      ]),
    ).toEqual([
      ["Name", "Score"],
      ["Ada", "90"],
    ]);
  });
});

describe("gridToPastePayload", () => {
  it("returns null for empty grid", () => {
    expect(gridToPastePayload([["", ""]])).toBeNull();
  });

  it("returns null for header-only grid", () => {
    expect(gridToPastePayload([["Name", "Email"], ["", ""]])).toBeNull();
  });

  it("produces TSV with header and data rows", () => {
    expect(
      gridToPastePayload([
        ["Name", "Score"],
        ["Ada", "90"],
      ]),
    ).toBe("Name\tScore\nAda\t90");
  });

  it("quotes cells with tabs", () => {
    expect(
      gridToPastePayload([
        ["Note"],
        ['has\ttab'],
      ]),
    ).toBe('Note\n"has\ttab"');
  });
});
