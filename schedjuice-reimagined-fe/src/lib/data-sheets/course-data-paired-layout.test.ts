import { describe, expect, it } from "vitest";

import type { CourseDataSheetRow } from "@/types/data-sheets";

import {
  buildCoursePairedDisplayRows,
  pairedLayoutTotals,
} from "./course-data-paired-layout";
import { formatStudentAtRatio } from "./format-student-at-ratio";

function row(p: Partial<CourseDataSheetRow>): CourseDataSheetRow {
  return {
    course_id: 1,
    category_name: "Starters",
    category_sort_order: 1,
    title: "X",
    start_date: "2026-06-05",
    end_date: "2026-06-30",
    course_type: "WD",
    student_count: 10,
    assistant_teacher_count: 1,
    start_time: "18:40",
    end_time: "20:30",
    main_teachers: "Teacher Su (Su)",
    assistant_teachers: "AT One (One)",
    current_unit: null,
    current_unit_updated_at: null,
    ...p,
  };
}

describe("formatStudentAtRatio", () => {
  it("formats students per AT as X : 1", () => {
    expect(formatStudentAtRatio(20, 1)).toBe("20 : 1");
    expect(formatStudentAtRatio(31, 2)).toBe("15.5 : 1");
  });

  it("returns 0 : 0 when AT count is zero", () => {
    expect(formatStudentAtRatio(20, 0)).toBe("0 : 0");
    expect(formatStudentAtRatio(20, null)).toBe("0 : 0");
  });
});

describe("buildCoursePairedDisplayRows", () => {
  it("pairs WD and WE courses side by side sorted by title", () => {
    const rows = [
      row({ course_id: 1, title: "B WD", course_type: "WD", student_count: 20 }),
      row({ course_id: 2, title: "A WD", course_type: "WD", student_count: 10 }),
      row({ course_id: 3, title: "Z WE", course_type: "WE", student_count: 5 }),
      row({ course_id: 4, title: "Y WE", course_type: "WE", student_count: 15 }),
    ];
    const { blocks, displayRows } = buildCoursePairedDisplayRows(rows);
    expect(blocks).toHaveLength(2);
    expect(displayRows.filter((d) => d.kind === "paired")).toHaveLength(2);
    const first = displayRows[0];
    expect(first.kind).toBe("paired");
    if (first.kind === "paired") {
      expect(first.cells[0]?.title).toBe("A WD");
      expect(first.cells[1]?.title).toBe("Y WE");
    }
    const second = displayRows[1];
    if (second.kind === "paired") {
      expect(second.cells[0]?.title).toBe("B WD");
      expect(second.cells[1]?.title).toBe("Z WE");
    }
  });

  it("appends summary row with per-block and grand totals", () => {
    const rows = [
      row({ course_id: 1, course_type: "WD", student_count: 20 }),
      row({ course_id: 2, course_type: "WE", student_count: 15 }),
    ];
    const { displayRows } = buildCoursePairedDisplayRows(rows);
    const summary = displayRows.find((d) => d.kind === "summary");
    expect(summary).toEqual({
      kind: "summary",
      blockTotals: [20, 15],
      grandTotal: 35,
    });
  });

  it("leaves blank WE cells when WD has more courses", () => {
    const rows = [
      row({ course_id: 1, course_type: "WD", student_count: 10 }),
      row({ course_id: 2, course_type: "WD", student_count: 5 }),
    ];
    const { displayRows } = buildCoursePairedDisplayRows(rows);
    expect(displayRows.filter((d) => d.kind === "paired")).toHaveLength(2);
    const second = displayRows[1];
    if (second.kind === "paired") {
      expect(second.cells[1]).toBeUndefined();
    }
  });

  it("lists OTHER courses after the summary row", () => {
    const rows = [
      row({ course_id: 1, course_type: "WD", student_count: 10 }),
      row({
        course_id: 2,
        title: "Grammar",
        course_type: "OTHER",
        student_count: 11,
      }),
    ];
    const { displayRows } = buildCoursePairedDisplayRows(rows);
    const other = displayRows.filter((d) => d.kind === "other");
    expect(other).toHaveLength(1);
    if (other[0].kind === "other") {
      expect(other[0].row.title).toBe("Grammar");
    }
  });

  it("omits summary when only OTHER courses exist", () => {
    const rows = [
      row({ course_id: 1, course_type: "OTHER", student_count: 5 }),
    ];
    const { displayRows } = buildCoursePairedDisplayRows(rows);
    expect(displayRows.some((d) => d.kind === "summary")).toBe(false);
    expect(displayRows.some((d) => d.kind === "paired")).toBe(false);
  });

  it("splits into four FM/HM blocks when groupByFmHm is true", () => {
    const rows = [
      row({
        course_id: 1,
        title: "FM WD",
        course_type: "WD",
        start_date: "2026-06-05",
        student_count: 10,
      }),
      row({
        course_id: 2,
        title: "FM WE",
        course_type: "WE",
        start_date: "2026-06-05",
        student_count: 11,
      }),
      row({
        course_id: 3,
        title: "HM WD",
        course_type: "WD",
        start_date: "2026-06-20",
        student_count: 12,
      }),
      row({
        course_id: 4,
        title: "HM WE",
        course_type: "WE",
        start_date: "2026-06-20",
        student_count: 13,
      }),
    ];
    const { blocks, displayRows } = buildCoursePairedDisplayRows(rows, true);
    expect(blocks.map((b) => b.label)).toEqual([
      "FM·WD",
      "FM·WE",
      "HM·WD",
      "HM·WE",
    ]);
    const paired = displayRows.find((d) => d.kind === "paired");
    expect(paired?.kind).toBe("paired");
    if (paired?.kind === "paired") {
      expect(paired.cells.map((c) => c?.title)).toEqual([
        "FM WD",
        "FM WE",
        "HM WD",
        "HM WE",
      ]);
    }
    const summary = displayRows.find((d) => d.kind === "summary");
    expect(summary).toEqual({
      kind: "summary",
      blockTotals: [10, 11, 12, 13],
      grandTotal: 46,
    });
  });

  it("combines FM and HM into WD/WE buckets when groupByFmHm is false", () => {
    const rows = [
      row({
        course_id: 1,
        title: "FM WD",
        course_type: "WD",
        start_date: "2026-06-05",
        student_count: 10,
      }),
      row({
        course_id: 2,
        title: "HM WD",
        course_type: "WD",
        start_date: "2026-06-20",
        student_count: 12,
      }),
    ];
    const { displayRows } = buildCoursePairedDisplayRows(rows, false);
    const summary = displayRows.find((d) => d.kind === "summary");
    expect(summary).toEqual({
      kind: "summary",
      blockTotals: [22, 0],
      grandTotal: 22,
    });
  });

  it("uses a single column when groupByWdWe is false", () => {
    const rows = [
      row({ course_id: 1, title: "A WD", course_type: "WD", student_count: 10 }),
      row({ course_id: 2, title: "B WE", course_type: "WE", student_count: 15 }),
    ];
    const { blocks, displayRows } = buildCoursePairedDisplayRows(rows, false, false);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.label).toBe("All");
    const paired = displayRows.filter((d) => d.kind === "paired");
    expect(paired).toHaveLength(2);
    const summary = displayRows.find((d) => d.kind === "summary");
    expect(summary).toEqual({
      kind: "summary",
      blockTotals: [25],
      grandTotal: 25,
    });
  });

  it("groups FM and HM side by side when groupByWdWe is false and groupByFmHm is true", () => {
    const rows = [
      row({
        course_id: 1,
        title: "FM WD",
        course_type: "WD",
        start_date: "2026-06-05",
        student_count: 10,
      }),
      row({
        course_id: 2,
        title: "HM WE",
        course_type: "WE",
        start_date: "2026-06-20",
        student_count: 12,
      }),
    ];
    const { blocks, displayRows } = buildCoursePairedDisplayRows(rows, true, false);
    expect(blocks.map((b) => b.label)).toEqual(["FM", "HM"]);
    const paired = displayRows.find((d) => d.kind === "paired");
    expect(paired?.kind).toBe("paired");
    if (paired?.kind === "paired") {
      expect(paired.cells.map((c) => c?.title)).toEqual(["FM WD", "HM WE"]);
    }
  });
});

describe("pairedLayoutTotals", () => {
  it("returns null when no bucketed courses", () => {
    expect(
      pairedLayoutTotals([row({ course_type: "OTHER", student_count: 5 })]),
    ).toBeNull();
  });

  it("sums student counts per bucket", () => {
    expect(
      pairedLayoutTotals([
        row({ course_type: "WD", student_count: 10 }),
        row({ course_type: "WD", student_count: null }),
        row({ course_type: "WE", student_count: 7 }),
      ]),
    ).toEqual({ blockTotals: [10, 7], grandTotal: 17 });
  });

  it("returns four block totals when groupByFmHm is true", () => {
    expect(
      pairedLayoutTotals(
        [
          row({
            course_type: "WD",
            start_date: "2026-06-05",
            student_count: 4,
          }),
          row({
            course_type: "WE",
            start_date: "2026-06-05",
            student_count: 5,
          }),
          row({
            course_type: "WD",
            start_date: "2026-06-20",
            student_count: 6,
          }),
          row({
            course_type: "WE",
            start_date: "2026-06-20",
            student_count: 7,
          }),
        ],
        true,
      ),
    ).toEqual({ blockTotals: [4, 5, 6, 7], grandTotal: 22 });
  });
});
