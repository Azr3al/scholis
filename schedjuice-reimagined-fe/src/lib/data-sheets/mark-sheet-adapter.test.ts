import { describe, expect, it } from "vitest";

import { makeMarkSheetAdapter } from "@/lib/data-sheets/mark-sheet-adapter";
import type { MarkSheetGrid } from "@/types/mark-sheets";

const grid: MarkSheetGrid = {
  sheet: {
    id: 1,
    course: 1,
    rubric: 1,
    title: "Writing",
    year: 2026,
    month: 5,
    exam_date: null,
  },
  rubric: {
    id: 1,
    course: 1,
    title: "Writing",
    source: "manual",
    columns: [
      { key: "content_1", title: "Content", kind: "score", sort_order: 0 },
      { key: "total", title: "Total", kind: "computed_total", sort_order: 1 },
    ],
  },
  students: [
    {
      id: 10,
      name: "Paul",
      code: "S1",
      alternative_name: "",
      communication_email: "paul@example.com",
    },
  ],
  cells: { "10:content_1": 4 },
  computed: { "10:total": 4 },
};

describe("makeMarkSheetAdapter", () => {
  it("computed total column is not editable", () => {
    const adapter = makeMarkSheetAdapter({
      grid,
      canEdit: true,
      onMarksChange: () => {},
    });
    expect(adapter.isCellEditable(0, "total")).toBe(false);
    expect(adapter.isCellEditable(0, "content_1")).toBe(true);
  });
});
