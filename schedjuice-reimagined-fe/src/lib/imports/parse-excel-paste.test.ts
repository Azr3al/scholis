import { describe, expect, it } from "vitest";

import {
  PASTE_MAX_ROWS,
  parseExcelPaste,
  parseExcelPasteWithHeaders,
} from "@/lib/imports/parse-excel-paste";

describe("parseExcelPaste", () => {
  it("returns empty rows for blank input", () => {
    expect(parseExcelPaste("", 3)).toEqual({
      rows: [],
      warnings: [],
      error: null,
    });
    expect(parseExcelPaste("   \n\n  ", 3)).toEqual({
      rows: [],
      warnings: [],
      error: null,
    });
  });

  it("pads short rows with null", () => {
    const result = parseExcelPaste("a@x.com\tAlice", 4);
    expect(result.rows).toEqual([["a@x.com", "Alice", null, null]]);
    expect(result.warnings).toEqual([]);
  });

  it("truncates extra columns with a warning", () => {
    const result = parseExcelPaste("a\tb\tc\td\te", 3);
    expect(result.rows).toEqual([["a", "b", "c"]]);
    expect(result.warnings).toEqual([
      "Row 1 had 5 columns; using first 3",
    ]);
  });

  it("handles Excel-style trailing tabs as empty trailing cells", () => {
    const result = parseExcelPaste("a@x.com\tAlice\t\t", 4);
    expect(result.rows).toEqual([["a@x.com", "Alice", null, null]]);
  });

  it("trims cell whitespace", () => {
    const result = parseExcelPaste("  a@x.com \t Alice ", 2);
    expect(result.rows).toEqual([["a@x.com", "Alice"]]);
  });

  it("handles CRLF line endings", () => {
    const result = parseExcelPaste("a@x.com\tAlice\r\nb@x.com\tBob", 2);
    expect(result.rows).toHaveLength(2);
  });

  it("returns error when column count is zero", () => {
    const result = parseExcelPaste("a\tb", 0);
    expect(result.rows).toEqual([]);
    expect(result.error).toBe("No columns in uploaded file");
  });
});

describe("parseExcelPasteWithHeaders", () => {
  it("returns empty result for blank input", () => {
    expect(parseExcelPasteWithHeaders("")).toEqual({
      headers: [],
      rows: [],
      warnings: [],
      error: null,
    });
    expect(parseExcelPasteWithHeaders("   \n\n  ")).toEqual({
      headers: [],
      rows: [],
      warnings: [],
      error: null,
    });
  });

  it("preserves empty header cells as empty strings", () => {
    const result = parseExcelPasteWithHeaders("email\t\tname\na@x.com\tx\tBob");
    expect(result.headers).toEqual(["email", "", "name"]);
  });

  it("pads narrow data rows with null", () => {
    const result = parseExcelPasteWithHeaders("a\tb\tc\n1\t2");
    expect(result.rows).toEqual([["1", "2", null]]);
  });

  it("truncates wide data rows with a warning", () => {
    const result = parseExcelPasteWithHeaders("a\tb\n1\t2\t3\t4");
    expect(result.rows).toEqual([["1", "2"]]);
    expect(result.warnings).toEqual([
      "Row 1 had 4 columns; using first 2",
    ]);
  });

  it("returns error when only header row is present", () => {
    const result = parseExcelPasteWithHeaders("email\tname");
    expect(result.headers).toEqual(["email", "name"]);
    expect(result.rows).toEqual([]);
    expect(result.error).toBe("No data rows found");
  });

  it("returns error when row count exceeds max", () => {
    const header = "email";
    const dataLines = Array.from(
      { length: PASTE_MAX_ROWS + 1 },
      (_, i) => `user${i}@x.com`,
    ).join("\n");
    const result = parseExcelPasteWithHeaders(`${header}\n${dataLines}`);
    expect(result.error).toBe(
      `Exceeds maximum of ${PASTE_MAX_ROWS} rows`,
    );
  });

  it("handles CRLF line endings", () => {
    const result = parseExcelPasteWithHeaders(
      "email\tname\r\na@x.com\tAlice\r\nb@x.com\tBob",
    );
    expect(result.rows).toHaveLength(2);
  });

  it("trims cell whitespace in headers and rows", () => {
    const result = parseExcelPasteWithHeaders(
      " email \t name \n a@x.com \t Alice ",
    );
    expect(result.headers).toEqual(["email", "name"]);
    expect(result.rows).toEqual([["a@x.com", "Alice"]]);
  });
});
