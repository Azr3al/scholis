import type { Theme } from "@glideapps/glide-data-grid";

export type LinkColors = {
  chipBg: string;
  chipBorder: string;
  chipText: string;
  ghostBorder: string;
  ghostText: string;
  mappedColumnBg: string;
  check: string;
  attnBg: string;
  attnBorder: string;
  attnText: string;
  warnBg: string;
  warnBorder: string;
  warnText: string;
  newTag: string;
  shimmerBase: string;
  shimmerHighlight: string;
  error: string;
};

export const LIGHT_LINK_COLORS: LinkColors = {
  chipBg: "#eef1ff",
  chipBorder: "#d6ddff",
  chipText: "#2f3bb3",
  ghostBorder: "#d4d4d8",
  ghostText: "#71717a",
  mappedColumnBg: "#ecfdf5",
  check: "#3aa564",
  attnBg: "#fff5e6",
  attnBorder: "#ffd8a1",
  attnText: "#9a5b00",
  warnBg: "#fefce8",
  warnBorder: "#fde047",
  warnText: "#854d0e",
  newTag: "#737373",
  shimmerBase: "#8a8f99",
  shimmerHighlight: "#cfd6ff",
  error: "#c0392b",
};

export const DARK_LINK_COLORS: LinkColors = {
  chipBg: "#2a3050",
  chipBorder: "#3d4a7a",
  chipText: "#b8c4ff",
  ghostBorder: "#3f3f46",
  ghostText: "#a1a1aa",
  mappedColumnBg: "#142820",
  check: "#5ec98a",
  attnBg: "#3d3018",
  attnBorder: "#6b5020",
  attnText: "#f0c878",
  warnBg: "#3d3818",
  warnBorder: "#6b6020",
  warnText: "#f0d878",
  newTag: "#a3a3a3",
  shimmerBase: "#5a5f6a",
  shimmerHighlight: "#6b7acc",
  error: "#f87171",
};

/**
 * Canvas `ctx.font` cannot resolve CSS `var(...)`, so we must use a concrete
 * font stack. We resolve the next/font variable to its real (hashed) family at
 * runtime and fall back to a literal stack during SSR / before resolution.
 */
const FONT_FALLBACK =
  '"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif';

const FONT = FONT_FALLBACK;

/** Canvas-safe hex/rgb tokens derived from globals.css light palette. */
export const LIGHT_GLIDE_THEME: Partial<Theme> = {
  accentColor: "#333333",
  accentFg: "#fafafa",
  accentLight: "rgba(51, 51, 51, 0.1)",
  textDark: "#242424",
  textMedium: "#737373",
  textLight: "#8a8a8a",
  textBubble: "#242424",
  bgIconHeader: "#737373",
  fgIconHeader: "#fafafa",
  textHeader: "#242424",
  textHeaderSelected: "#fafafa",
  bgCell: "#ffffff",
  bgCellMedium: "#f7f7f7",
  bgHeader: "#f7f7f7",
  bgHeaderHasFocus: "#ebebeb",
  bgHeaderHovered: "#f0f0f0",
  bgBubble: "#f7f7f7",
  bgBubbleSelected: "#ebebeb",
  bgSearchResult: "rgba(51, 51, 51, 0.12)",
  borderColor: "#ebebeb",
  drilldownBorder: "#d4d4d4",
  linkColor: "#333333",
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
  headerFontStyle: "600 11px",
  headerIconSize: 18,
  baseFontStyle: "13px",
  markerFontStyle: "12px",
  fontFamily: FONT,
  editorFontSize: "13px",
  lineHeight: 1.4,
  horizontalBorderColor: "#ebebeb",
  headerBottomBorderColor: "#ebebeb",
};

/** Canvas-safe hex/rgb tokens derived from globals.css dark palette. */
export const DARK_GLIDE_THEME: Partial<Theme> = {
  accentColor: "#6ec9a8",
  accentFg: "#242424",
  accentLight: "rgba(110, 201, 168, 0.15)",
  textDark: "#fafafa",
  textMedium: "#a3a3a3",
  textLight: "#737373",
  textBubble: "#fafafa",
  bgIconHeader: "#a3a3a3",
  fgIconHeader: "#242424",
  textHeader: "#fafafa",
  textHeaderSelected: "#242424",
  bgCell: "#242424",
  bgCellMedium: "#2e2e2e",
  bgHeader: "#454545",
  bgHeaderHasFocus: "#525252",
  bgHeaderHovered: "#4a4a4a",
  bgBubble: "#454545",
  bgBubbleSelected: "#525252",
  bgSearchResult: "rgba(110, 201, 168, 0.2)",
  borderColor: "#3d3d3d",
  drilldownBorder: "#525252",
  linkColor: "#6ec9a8",
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
  headerFontStyle: "600 11px",
  headerIconSize: 18,
  baseFontStyle: "13px",
  markerFontStyle: "12px",
  fontFamily: FONT,
  editorFontSize: "13px",
  lineHeight: 1.4,
  horizontalBorderColor: "#3d3d3d",
  headerBottomBorderColor: "#3d3d3d",
};

let activeLinkColors: LinkColors = LIGHT_LINK_COLORS;
let activeFontPx = 13;
let activeFontFamily = FONT_FALLBACK;

export function setActiveLinkColors(colors: LinkColors): void {
  activeLinkColors = colors;
}

export function getActiveLinkColors(): LinkColors {
  return activeLinkColors;
}

export function setActiveFontPx(px: number): void {
  activeFontPx = px;
}

export function getActiveFontPx(): number {
  return activeFontPx;
}

/**
 * Resolves the next/font CSS variable (`--font-geist-sans`) to its concrete
 * font-family value so canvas text can render in the real font. Falls back to a
 * literal stack when running on the server or if the variable is unavailable.
 */
export function resolveFontFamily(): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return activeFontFamily;
  }
  try {
    const fromVar = getComputedStyle(document.body)
      .getPropertyValue("--font-geist-sans")
      .trim();
    activeFontFamily = fromVar
      ? `${fromVar}, ui-sans-serif, system-ui, sans-serif`
      : FONT_FALLBACK;
  } catch {
    activeFontFamily = FONT_FALLBACK;
  }
  return activeFontFamily;
}

export function getActiveFontFamily(): string {
  return activeFontFamily;
}

/** @deprecated Use useGlideTheme() instead. */
export function buildGlideTheme(): Partial<Theme> {
  return LIGHT_GLIDE_THEME;
}
