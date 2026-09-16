import { describe, expect, it } from "vitest";

import {
  MARK_SHEET_GRID_CHROME,
  MARK_SHEET_HEADER_SLOT_ESTIMATE,
  markSheetEditorHeightForRows,
  resolveMarkSheetGridHeight,
} from "./mark-sheet-grid-height";

describe("resolveMarkSheetGridHeight", () => {
  it("fits all rows when container is squeezed", () => {
    const rowCount = 4;
    const height = resolveMarkSheetGridHeight({
      rowCount,
      containerHeight: 200,
      viewportHeight: 900,
    });
    const contentMin =
      MARK_SHEET_GRID_CHROME +
      MARK_SHEET_HEADER_SLOT_ESTIMATE +
      markSheetEditorHeightForRows(rowCount);
    expect(height).toBeGreaterThanOrEqual(contentMin);
    expect(markSheetEditorHeightForRows(rowCount)).toBeGreaterThanOrEqual(rowCount * 36);
  });

  it("caps at 70% viewport", () => {
    const height = resolveMarkSheetGridHeight({
      rowCount: 100,
      containerHeight: 2000,
      viewportHeight: 800,
    });
    expect(height).toBeLessThanOrEqual(Math.floor(800 * 0.7));
  });

  it("ignores squeezed container when containerHeight is zero (review step)", () => {
    const rowCount = 4;
    const height = resolveMarkSheetGridHeight({
      rowCount,
      containerHeight: 0,
      viewportHeight: 900,
      reserveBelow: 320,
    });
    const contentMin =
      MARK_SHEET_GRID_CHROME +
      MARK_SHEET_HEADER_SLOT_ESTIMATE +
      markSheetEditorHeightForRows(rowCount);
    expect(height).toBeGreaterThanOrEqual(contentMin);
    expect(height).toBeLessThanOrEqual(Math.floor(900 * 0.7) - 320);
  });

  it("respects measured header slot height", () => {
    const rowCount = 2;
    const height = resolveMarkSheetGridHeight({
      rowCount,
      containerHeight: 200,
      viewportHeight: 900,
      headerSlotHeight: 96,
    });
    const contentMin =
      MARK_SHEET_GRID_CHROME + 96 + markSheetEditorHeightForRows(rowCount);
    expect(height).toBeGreaterThanOrEqual(contentMin);
  });
});
