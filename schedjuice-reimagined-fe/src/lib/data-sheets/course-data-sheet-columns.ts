import type { CoursePairedBlock } from "./course-data-paired-layout";

export const COURSE_DATA_DIVIDER_BG = "#e5e7eb";
export const COURSE_DATA_DIVIDER_WIDTH = 20;

export function isCourseDataDividerField(field: string | null | undefined): boolean {
  return field != null && /^divide_\d+$/.test(field);
}

export function isCourseDataWdWeDividerAfterBlock(
  blocks: CoursePairedBlock[],
  index: number,
): boolean {
  return blocks[index]?.id.endsWith("wd") === true && index + 1 < blocks.length;
}

export function buildCourseDataSheetColumns(blocks: CoursePairedBlock[]) {
  const cols: { id: string; title: string; width: number }[] = [];
  const centerFields = new Set<string>();
  const numericFields: string[] = [];
  const dividerFields = new Set<string>();
  const hasWdWeSplit = blocks.some((b) =>
    ["wd", "we", "fm_wd", "fm_we", "hm_wd", "hm_we"].includes(b.id),
  );

  blocks.forEach((block, index) => {
    const prefix = `b${index}`;
    cols.push({
      id: `${prefix}_title`,
      title: `Class (${block.label})`,
      width: 200,
    });
    cols.push({ id: `${prefix}_start`, title: "Start", width: 95 });
    cols.push({ id: `${prefix}_end`, title: "End", width: 95 });
    cols.push({ id: `${prefix}_mt`, title: "MT", width: 180 });
    cols.push({ id: `${prefix}_at`, title: "AT", width: 200 });
    cols.push({ id: `${prefix}_students`, title: "Stu No.", width: 56 });
    cols.push({
      id: `${prefix}_ratio`,
      title: "Student/AT ratio",
      width: 96,
    });
    cols.push({ id: `${prefix}_total`, title: "Total", width: 56 });
    cols.push({ id: `${prefix}_unit`, title: "Current unit", width: 110 });

    centerFields.add(`${prefix}_students`);
    centerFields.add(`${prefix}_ratio`);
    centerFields.add(`${prefix}_total`);
    numericFields.push(`${prefix}_students`, `${prefix}_total`);

    if (isCourseDataWdWeDividerAfterBlock(blocks, index)) {
      const divideId = `divide_${index}`;
      cols.push({ id: divideId, title: "", width: COURSE_DATA_DIVIDER_WIDTH });
      dividerFields.add(divideId);
    }
  });

  cols.push({
    id: "grand_total",
    title: hasWdWeSplit ? "Total (WD+WE)" : "Total",
    width: 72,
  });
  centerFields.add("grand_total");
  numericFields.push("grand_total");

  return { cols, centerFields, numericFields, dividerFields };
}
