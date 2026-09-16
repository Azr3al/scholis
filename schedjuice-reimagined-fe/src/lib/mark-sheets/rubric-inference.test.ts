import { describe, expect, it } from "vitest";

import { inferRubricColumns } from "@/lib/mark-sheets/rubric-inference";

describe("inferRubricColumns", () => {
  it("classifies identifier, score, and total columns", () => {
    const headers = ["No.", "English name", "Content", "Total (40) mark"];
    const rows = [["1", "Paul", "4", "28"]];
    const cols = inferRubricColumns(headers, rows);
    expect(cols.find((c) => c.title === "English name")?.kind).toBe("identifier");
    expect(cols.find((c) => c.title === "Content")?.kind).toBe("score");
    expect(cols.find((c) => c.title === "Total (40) mark")?.kind).toBe(
      "computed_total",
    );
  });
});
