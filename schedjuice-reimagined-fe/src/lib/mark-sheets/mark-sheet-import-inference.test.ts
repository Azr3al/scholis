import { describe, expect, it } from "vitest";

import {
  columnIsGradeColumn,
  inferImportColumns,
  parseMaxMarksFromHeader,
  validateSectionMaxMarks,
} from "@/lib/mark-sheets/mark-sheet-import-inference";

describe("mark-sheet-import-inference", () => {
  it("parses max marks from M suffix headers", () => {
    expect(parseMaxMarksFromHeader("Reading and UoE(81M)")).toBe(81);
    expect(parseMaxMarksFromHeader("Writing (20M)")).toBe(20);
  });

  it("classifies reading layout with ignored grade columns", () => {
    const headers = [
      "No.",
      "English name",
      "Reading and UoE(81M)",
      "R&W Grade",
      "Writing (20M)",
    ];
    const rows = [["1", "Paul", "53", "B", "28"]];
    const { columns, columnMapping } = inferImportColumns(headers, rows);
    const kinds = Object.fromEntries(columns.map((c) => [c.title, c.kind]));
    expect(kinds["Reading and UoE(81M)"]).toBe("score");
    expect(columns.find((c) => c.title === "Reading and UoE(81M)")?.max_marks).toBe(81);
    expect(kinds["R&W Grade"]).toBe("ignored");
    expect(columnMapping.name).toBe(1);
  });

  it("warns when section max marks do not match grand total header", () => {
    const headers = ["Reading (81M)", "Writing (20M)", "Total (173M)"];
    const rows = [["50", "10", "60"]];
    const { columns } = inferImportColumns(headers, rows);
    const warnings = validateSectionMaxMarks(columns);
    expect(warnings.some((w) => w.includes("173"))).toBe(true);
  });

  it("does not treat grade values as burmese name column", () => {
    expect(columnIsGradeColumn("R&W Grade", ["A+", "B"])).toBe(true);
  });

  it("does not throw when headers contain null or non-string cells", () => {
    const headers = ["No.", null, undefined, "Reading (81M)"] as unknown as string[];
    const rows = [["1", "Paul", "x", "53"]];
    expect(() => inferImportColumns(headers, rows)).not.toThrow();
    const { columns } = inferImportColumns(headers, rows);
    expect(columns).toHaveLength(4);
    expect(columns[1]?.title).toBe("Column 2");
    expect(columns[2]?.title).toBe("Column 3");
  });
});
