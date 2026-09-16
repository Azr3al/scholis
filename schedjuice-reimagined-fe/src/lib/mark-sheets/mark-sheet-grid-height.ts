export const MARK_SHEET_ROW_HEIGHT = 36;
export const MARK_SHEET_MIN_GRID_HEIGHT = 400;
export const MARK_SHEET_MAX_GRID_HEIGHT_RATIO = 0.7;
export const MARK_SHEET_HEADER_SLOT_ESTIMATE = 72;
/** Toolbar height inside DataSheet (copy/paste bar). */
export const MARK_SHEET_GRID_CHROME = 40;
/** Rubric + student matching + action buttons below the review grid. */
export const MARK_SHEET_REVIEW_PANELS_RESERVE = 320;
const ROW_AREA_PADDING = 4;

export type MarkSheetGridHeightInput = {
  rowCount: number;
  containerHeight: number;
  viewportHeight: number;
  headerSlotHeight?: number;
  /** Viewport space reserved for panels below the grid (review step only). */
  reserveBelow?: number;
};

/** Minimum canvas height to show every row without vertical scroll. */
export function markSheetEditorHeightForRows(rowCount: number): number {
  return rowCount * MARK_SHEET_ROW_HEIGHT + ROW_AREA_PADDING;
}

/**
 * Total DataSheet outer height. Includes toolbar + header slot + editor area;
 * DataSheet subtracts toolbar and header slot when sizing the canvas.
 */
export function resolveMarkSheetGridHeight({
  rowCount,
  containerHeight,
  viewportHeight,
  headerSlotHeight,
  reserveBelow = 0,
}: MarkSheetGridHeightInput): number {
  const headerSlot = headerSlotHeight ?? MARK_SHEET_HEADER_SLOT_ESTIMATE;
  const contentMin =
    MARK_SHEET_GRID_CHROME + headerSlot + markSheetEditorHeightForRows(rowCount);
  const availableViewport =
    Math.floor(viewportHeight * MARK_SHEET_MAX_GRID_HEIGHT_RATIO) - reserveBelow;
  const floor =
    containerHeight > 0
      ? Math.max(contentMin, containerHeight)
      : contentMin;
  const preferred = Math.max(floor, MARK_SHEET_MIN_GRID_HEIGHT);

  if (contentMin <= availableViewport) {
    return Math.min(preferred, availableViewport);
  }

  return Math.max(availableViewport, MARK_SHEET_MIN_GRID_HEIGHT);
}
