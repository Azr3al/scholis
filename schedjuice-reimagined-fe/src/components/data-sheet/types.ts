import type { ReactNode } from "react";

export type SheetDensity = "compact" | "comfortable" | "spacious";
export type SheetFontSize =
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "extraLarge"
  | "huge";

export interface SheetAdapter {
  rowCount: number;
  getCellValue(row: number, field: string): string;
  setCellValue(row: number, field: string, value: string): void;
  isCellEditable(row: number, field: string): boolean;
  appendRows?(count: number): number[];
  removeRows?(rows: number[]): void;
  getNumericValue?(row: number, field: string): number | null;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  field: string;
  direction: SortDirection;
}

export interface SheetCapabilities {
  undo?: boolean;
  copyPaste?: boolean;
  statusBar?: boolean;
  density?: boolean;
  fontSize?: boolean;
  columnVisibility?: boolean;
  columnReorder?: boolean;
  columnResize?: boolean;
  sortable?: boolean;
  contextMenu?: boolean;
  gotoRow?: boolean;
}

export interface SheetMenuConfig {
  roleLabel: string;
  toolbarRight?: ReactNode;
  statusSlot?: ReactNode;
  /** When set, toolbar Paste invokes this instead of the default clipboard paste. */
  onPaste?: () => void | Promise<void>;
}

export const DENSITY_ROW_HEIGHT: Record<SheetDensity, number> = {
  compact: 28,
  comfortable: 36,
  spacious: 44,
};

export const DENSITY_HEADER_HEIGHT: Record<SheetDensity, number> = {
  compact: 30,
  comfortable: 36,
  spacious: 40,
};

export const FONT_SIZE_PX: Record<SheetFontSize, number> = {
  tiny: 9,
  small: 11,
  medium: 13,
  large: 17,
  extraLarge: 21,
  huge: 26,
};

export const FONT_SIZE_LABELS: Record<SheetFontSize, string> = {
  tiny: "Tiny",
  small: "Small",
  medium: "Medium",
  large: "Large",
  extraLarge: "Extra large",
  huge: "Huge",
};

export const FONT_SIZE_ORDER: SheetFontSize[] = [
  "tiny",
  "small",
  "medium",
  "large",
  "extraLarge",
  "huge",
];

const BASE_FONT_PX = FONT_SIZE_PX.medium;

/** Extra row padding so larger fonts never clip vertically. */
function fontRowExtra(fontSize: SheetFontSize): number {
  const delta = FONT_SIZE_PX[fontSize] - BASE_FONT_PX;
  if (delta <= 0) return delta;
  return delta + Math.ceil(delta * 0.35);
}

export function rowHeightFor(
  density: SheetDensity,
  fontSize: SheetFontSize,
): number {
  return Math.max(22, DENSITY_ROW_HEIGHT[density] + fontRowExtra(fontSize));
}

export function headerHeightFor(
  density: SheetDensity,
  fontSize: SheetFontSize,
): number {
  const delta = FONT_SIZE_PX[fontSize] - BASE_FONT_PX;
  return Math.max(24, DENSITY_HEADER_HEIGHT[density] + delta);
}

export interface FontThemeFields {
  baseFontStyle: string;
  baseFontFull: string;
  markerFontStyle: string;
  markerFontFull: string;
  headerFontStyle: string;
  headerFontFull: string;
}

/** Glide canvas text uses `baseFontFull`; set all font fields explicitly. */
export function fontThemeFieldsFor(
  px: number,
  fontFamily: string,
): FontThemeFields {
  const markerPx = Math.max(px - 2, 8);
  const headerPx = Math.max(px - 1, 9);
  return {
    baseFontStyle: `${px}px`,
    baseFontFull: `${px}px ${fontFamily}`,
    markerFontStyle: `${markerPx}px`,
    markerFontFull: `${markerPx}px ${fontFamily}`,
    headerFontStyle: `600 ${headerPx}px`,
    headerFontFull: `600 ${headerPx}px ${fontFamily}`,
  };
}

export function fontLineHeightFor(px: number): number {
  if (px >= 20) return 1.35;
  if (px <= 10) return 1.25;
  return 1.4;
}

export function fontCellPaddingFor(px: number): {
  cellVerticalPadding: number;
  cellHorizontalPadding: number;
} {
  return {
    cellVerticalPadding: Math.max(2, Math.round(px * 0.22)),
    cellHorizontalPadding: Math.max(6, Math.round(px * 0.55)),
  };
}
