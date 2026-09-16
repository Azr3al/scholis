import { describe, expect, it } from "vitest";

import {
  buildMarkSheetImportRows,
  countUnresolvedMarkSheetRows,
} from "@/lib/mark-sheets/mark-sheet-commit";
import { type CellResolution } from "@/lib/imports/resolution";

const mapping = { name: 0, email: 1 };
const rows = [["Su Su", "susu@su.com"], ["Paul", "paul@example.com"]];
const rowIds = ["row-0", "row-1"];

describe("buildMarkSheetImportRows", () => {
  it("reports unresolved rows instead of silently dropping them", () => {
    const resolution = new Map<string, CellResolution>([
      ["row-0:email", { status: "new" }],
      ["row-0:name", { status: "new" }],
      [
        "row-1:email",
        {
          status: "confirmed",
          entityRef: { id: 42, label: "Paul" },
          confirmedUserId: 42,
        },
      ],
      [
        "row-1:name",
        {
          status: "confirmed",
          entityRef: { id: 42, label: "Paul" },
          confirmedUserId: 42,
        },
      ],
    ]);

    const result = buildMarkSheetImportRows({
      rows,
      rowIds,
      resolution,
      columnMapping: mapping,
      scoreColIndexByKey: new Map(),
      scoreKeys: [],
    });

    expect(result.unresolvedRowIndexes).toEqual([0]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.student_id).toBe(42);
  });

  it("excludes ignored rows without counting them unresolved", () => {
    const resolution = new Map<string, CellResolution>([
      ["row-0:email", { status: "ignored" }],
      ["row-0:name", { status: "ignored" }],
      [
        "row-1:email",
        {
          status: "confirmed",
          entityRef: { id: 42, label: "Paul" },
          confirmedUserId: 42,
        },
      ],
      [
        "row-1:name",
        {
          status: "confirmed",
          entityRef: { id: 42, label: "Paul" },
          confirmedUserId: 42,
        },
      ],
    ]);

    const result = buildMarkSheetImportRows({
      rows,
      rowIds,
      resolution,
      columnMapping: mapping,
      scoreColIndexByKey: new Map(),
      scoreKeys: [],
    });

    expect(result.unresolvedRowIndexes).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.student_id).toBe(42);
  });

  it("uses confirmedUserId from a manual roster pick", () => {
    const resolution = new Map<string, CellResolution>([
      [
        "row-0:email",
        {
          status: "confirmed",
          entityRef: { id: 99, label: "Su Su Hlaing" },
          confirmedUserId: 99,
          matchField: "manual",
        },
      ],
      [
        "row-0:name",
        {
          status: "confirmed",
          entityRef: { id: 99, label: "Su Su Hlaing" },
          confirmedUserId: 99,
          matchField: "manual",
        },
      ],
    ]);

    const result = buildMarkSheetImportRows({
      rows: [rows[0]!],
      rowIds: ["row-0"],
      resolution,
      columnMapping: mapping,
      scoreColIndexByKey: new Map([["reading", 2]]),
      scoreKeys: ["reading"],
    });

    expect(result.unresolvedRowIndexes).toEqual([]);
    expect(result.rows[0]?.student_id).toBe(99);
  });
});

describe("countUnresolvedMarkSheetRows", () => {
  it("counts new and pending rows using resolveRowUserResolution", () => {
    const resolution = new Map<string, CellResolution>([
      ["row-0:name", { status: "new" }],
      ["row-1:name", { status: "pending_candidates", candidates: [] }],
      ["row-2:name", { status: "ignored" }],
    ]);

    expect(
      countUnresolvedMarkSheetRows(resolution, ["row-0", "row-1", "row-2"], {
        name: 0,
      }),
    ).toBe(2);
  });
});
