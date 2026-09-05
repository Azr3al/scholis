import { describe, expect, it } from "vitest";

import type { CoursePairedBlock } from "./course-data-paired-layout";

import {
  buildCourseDataSheetColumns,
  isCourseDataDividerField,
  isCourseDataWdWeDividerAfterBlock,
} from "./course-data-sheet-columns";

const TWO_BLOCKS: CoursePairedBlock[] = [
  { id: "wd", label: "WD", groupKeys: ["FM_WD", "HM_WD"] },
  { id: "we", label: "WE", groupKeys: ["FM_WE", "HM_WE"] },
];

const FOUR_BLOCKS: CoursePairedBlock[] = [
  { id: "fm_wd", label: "FM·WD", groupKeys: ["FM_WD"] },
  { id: "fm_we", label: "FM·WE", groupKeys: ["FM_WE"] },
  { id: "hm_wd", label: "HM·WD", groupKeys: ["HM_WD"] },
  { id: "hm_we", label: "HM·WE", groupKeys: ["HM_WE"] },
];

describe("isCourseDataWdWeDividerAfterBlock", () => {
  it("returns true after WD blocks when another block follows", () => {
    expect(isCourseDataWdWeDividerAfterBlock(TWO_BLOCKS, 0)).toBe(true);
    expect(isCourseDataWdWeDividerAfterBlock(FOUR_BLOCKS, 0)).toBe(true);
    expect(isCourseDataWdWeDividerAfterBlock(FOUR_BLOCKS, 2)).toBe(true);
  });

  it("returns false after WE blocks or the last block", () => {
    expect(isCourseDataWdWeDividerAfterBlock(TWO_BLOCKS, 1)).toBe(false);
    expect(isCourseDataWdWeDividerAfterBlock(FOUR_BLOCKS, 1)).toBe(false);
    expect(isCourseDataWdWeDividerAfterBlock(FOUR_BLOCKS, 3)).toBe(false);
  });
});

describe("isCourseDataDividerField", () => {
  it("matches divide column ids", () => {
    expect(isCourseDataDividerField("divide_0")).toBe(true);
    expect(isCourseDataDividerField("b0_title")).toBe(false);
    expect(isCourseDataDividerField(null)).toBe(false);
  });
});

describe("buildCourseDataSheetColumns", () => {
  it("inserts divide_0 between WD and WE in the two-block layout", () => {
    const { cols, dividerFields } = buildCourseDataSheetColumns(TWO_BLOCKS);
    const ids = cols.map((c) => c.id);
    expect(ids.indexOf("b0_unit")).toBe(ids.indexOf("b0_total") + 1);
    expect(ids.indexOf("divide_0")).toBe(ids.indexOf("b0_unit") + 1);
    expect(ids.indexOf("b1_title")).toBe(ids.indexOf("divide_0") + 1);
    expect(dividerFields).toEqual(new Set(["divide_0"]));
  });

  it("inserts divide_0 and divide_2 in the four-block FM/HM layout", () => {
    const { cols, dividerFields } = buildCourseDataSheetColumns(FOUR_BLOCKS);
    const ids = cols.map((c) => c.id);
    expect(ids).toContain("divide_0");
    expect(ids).toContain("divide_2");
    expect(ids).not.toContain("divide_1");
    expect(ids).not.toContain("divide_3");
    expect(dividerFields).toEqual(new Set(["divide_0", "divide_2"]));
  });

  it("keeps divider fields out of center and numeric field sets", () => {
    const { centerFields, numericFields, dividerFields } =
      buildCourseDataSheetColumns(TWO_BLOCKS);
    for (const field of Array.from(dividerFields)) {
      expect(centerFields.has(field)).toBe(false);
      expect(numericFields).not.toContain(field);
    }
  });

  it("uses Total for grand total when WD/WE columns are absent", () => {
    const { cols } = buildCourseDataSheetColumns([
      { id: "all", label: "All", groupKeys: ["FM_WD", "FM_WE", "HM_WD", "HM_WE"] },
    ]);
    expect(cols.find((c) => c.id === "grand_total")?.title).toBe("Total");
  });
});
