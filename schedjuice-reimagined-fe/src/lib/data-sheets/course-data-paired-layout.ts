import type { CourseDataSheetRow } from "@/types/data-sheets";

import {
  type CourseGroupKey,
  groupKeyFor,
} from "./course-data-grouping";

export type CoursePairedBlock = {
  id: string;
  label: string;
  groupKeys: CourseGroupKey[];
};

export type CoursePairedDisplayRow =
  | { kind: "paired"; cells: (CourseDataSheetRow | undefined)[] }
  | {
      kind: "summary";
      blockTotals: number[];
      grandTotal: number;
    }
  | { kind: "other"; row: CourseDataSheetRow };

type CoursePairedLayoutResult = {
  blocks: CoursePairedBlock[];
  displayRows: CoursePairedDisplayRow[];
};

const TWO_BLOCKS: CoursePairedBlock[] = [
  { id: "wd", label: "WD", groupKeys: ["FM_WD", "HM_WD"] },
  { id: "we", label: "WE", groupKeys: ["FM_WE", "HM_WE"] },
];

const FM_HM_BLOCKS: CoursePairedBlock[] = [
  { id: "fm", label: "FM", groupKeys: ["FM_WD", "FM_WE"] },
  { id: "hm", label: "HM", groupKeys: ["HM_WD", "HM_WE"] },
];

const SINGLE_BLOCK: CoursePairedBlock[] = [
  {
    id: "all",
    label: "All",
    groupKeys: ["FM_WD", "HM_WD", "FM_WE", "HM_WE"],
  },
];

const FOUR_BLOCKS: CoursePairedBlock[] = [
  { id: "fm_wd", label: "FM·WD", groupKeys: ["FM_WD"] },
  { id: "fm_we", label: "FM·WE", groupKeys: ["FM_WE"] },
  { id: "hm_wd", label: "HM·WD", groupKeys: ["HM_WD"] },
  { id: "hm_we", label: "HM·WE", groupKeys: ["HM_WE"] },
];

function sumStudentCounts(rows: CourseDataSheetRow[]): number {
  return rows.reduce((acc, r) => acc + (r.student_count ?? 0), 0);
}

function bucketRows(
  rows: CourseDataSheetRow[],
  blocks: CoursePairedBlock[],
): { buckets: CourseDataSheetRow[][]; other: CourseDataSheetRow[] } {
  const buckets: CourseDataSheetRow[][] = blocks.map(() => []);
  const other: CourseDataSheetRow[] = [];

  for (const r of rows) {
    const key = groupKeyFor(r);
    if (key === "OTHER") {
      other.push(r);
      continue;
    }
    const blockIndex = blocks.findIndex((b) => b.groupKeys.includes(key));
    if (blockIndex >= 0) {
      buckets[blockIndex].push(r);
    } else {
      other.push(r);
    }
  }

  for (const bucket of buckets) {
    bucket.sort((a, b) => a.title.localeCompare(b.title));
  }
  other.sort((a, b) => a.title.localeCompare(b.title));

  return { buckets, other };
}

function getCoursePairedBlocks(
  groupByFmHm: boolean,
  groupByWdWe: boolean,
): CoursePairedBlock[] {
  if (!groupByWdWe) {
    return groupByFmHm ? FM_HM_BLOCKS : SINGLE_BLOCK;
  }
  return groupByFmHm ? FOUR_BLOCKS : TWO_BLOCKS;
}

/** Side-by-side block rows with summary totals for a single category. */
export function buildCoursePairedDisplayRows(
  rows: CourseDataSheetRow[],
  groupByFmHm = false,
  groupByWdWe = true,
): CoursePairedLayoutResult {
  const blocks = getCoursePairedBlocks(groupByFmHm, groupByWdWe);
  const { buckets, other } = bucketRows(rows, blocks);
  const displayRows: CoursePairedDisplayRow[] = [];

  const pairCount = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < pairCount; i++) {
    displayRows.push({
      kind: "paired",
      cells: buckets.map((b) => b[i]),
    });
  }

  const hasAnyBucket = buckets.some((b) => b.length > 0);
  if (hasAnyBucket) {
    const blockTotals = buckets.map(sumStudentCounts);
    displayRows.push({
      kind: "summary",
      blockTotals,
      grandTotal: blockTotals.reduce((acc, total) => acc + total, 0),
    });
  }

  for (const row of other) {
    displayRows.push({ kind: "other", row });
  }

  return { blocks, displayRows };
}

/** Totals for the paired block (summary row), or null when no bucketed courses. */
export function pairedLayoutTotals(
  rows: CourseDataSheetRow[],
  groupByFmHm = false,
  groupByWdWe = true,
): { blockTotals: number[]; grandTotal: number } | null {
  const blocks = getCoursePairedBlocks(groupByFmHm, groupByWdWe);
  const { buckets } = bucketRows(rows, blocks);
  if (!buckets.some((b) => b.length > 0)) return null;
  const blockTotals = buckets.map(sumStudentCounts);
  return {
    blockTotals,
    grandTotal: blockTotals.reduce((acc, total) => acc + total, 0),
  };
}
