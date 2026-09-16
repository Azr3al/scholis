import { describe, expect, it } from "vitest";

import { flattenTwoRowHeaders } from "@/lib/mark-sheets/header-flatten";
import { inferRubricColumns } from "@/lib/mark-sheets/rubric-inference";

const SCREENSHOT_HEADERS = [
  "No.",
  "Burmese Name",
  "English name",
  "Reading and Use of English (78 marks)",
  "",
  "Writing (40 marks)",
  "",
  "Listening (30 marks)",
  "",
  "Speaking (25 marks)",
  "",
];

const SCREENSHOT_SUB_ROW = [
  "",
  "",
  "",
  "Mark",
  "Grade",
  "Mark",
  "Grade",
  "Mark",
  "Grade",
  "Mark",
  "Grade",
];

const SCREENSHOT_DATA_ROW = [
  "1",
  "Aung Myin Su Naing",
  "Paul Herbold",
  "53",
  "B",
  "28",
  "B",
  "29",
  "A+",
  "22",
  "A+",
];

describe("flattenTwoRowHeaders", () => {
  it("flattens two-row merged header layout", () => {
    const { headers, rows } = flattenTwoRowHeaders(SCREENSHOT_HEADERS, [
      SCREENSHOT_SUB_ROW,
      SCREENSHOT_DATA_ROW,
    ]);

    expect(headers).toContain("Reading and Use of English (78 marks) Mark");
    expect(headers).toContain("Writing (40 marks) Mark");
    expect(headers[0]).toBe("No.");
    expect(rows[0]).toEqual(SCREENSHOT_DATA_ROW);
  });

  it("leaves single-row headers unchanged", () => {
    const headers = ["No.", "English name", "Content", "Total (40) mark"];
    const rows = [["1", "Paul", "4", "28"]];

    const flat = flattenTwoRowHeaders(headers, rows);

    expect(flat.headers).toEqual(headers);
    expect(flat.rows).toEqual(rows);
  });

  it("does not flatten when first row looks like student data", () => {
    const rows = [SCREENSHOT_DATA_ROW, ["2", "Other", "David", "50", "B", "30", "B", "28", "A", "20", "A"]];
    const flat = flattenTwoRowHeaders(SCREENSHOT_HEADERS, rows);

    expect(flat.headers).toEqual(SCREENSHOT_HEADERS);
    expect(flat.rows).toEqual(rows);
  });

  it("classifies mark columns as score and grade columns as identifier", () => {
    const { headers, rows } = flattenTwoRowHeaders(SCREENSHOT_HEADERS, [
      SCREENSHOT_SUB_ROW,
      SCREENSHOT_DATA_ROW,
    ]);
    const cols = inferRubricColumns(headers, rows);
    const kinds = Object.fromEntries(cols.map((c) => [c.title, c.kind]));

    expect(kinds["Reading and Use of English (78 marks) Mark"]).toBe("score");
    expect(kinds["Writing (40 marks) Mark"]).toBe("score");
    expect(kinds["Reading and Use of English (78 marks) Grade"]).toBe("ignored");
  });
});
