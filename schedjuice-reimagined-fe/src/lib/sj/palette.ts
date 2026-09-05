/**
 * Canonical Schedjuice token hexes (DESIGN.md §5/§16). Single source for AA tests.
 * The .sj-root CSS in globals.css MUST use these same literals (cross-referenced by comment).
 */

export const RAW = {
  pixelWhite: "#FAF7F2",
  terminal: "#102C24",
  circuitBoard: "#2E4E49",
  dataGreen: "#60A17E",
  dataGreenStrong: "#2F6E58",
  danger: "#B7432F",
  /** Teal-leaning positive — hue-separated from cool accent `#2F6E58`. */
  success: "#1A6E62",
  /** Label on solid success fills (light). */
  successForeground: "#FFFFFF",
  /** Amber fill / border / dots — not for body text (use `warningForeground`). */
  warning: "#C98A2B",
  /** Caution text on cream — WCAG AA body. */
  warningForeground: "#7A5218",
  /** Info / step chrome — AA on cream (replaces neon legacy status-blue). */
  statusBlue: "#1E6A9A",
} as const;

/** Warm grayscale ramp — brown undertone, no cool grays (DESIGN.md §5). */
export const WARM = {
  50: "#F8F5F0",
  100: "#F5F0E8",
  200: "#E8E2D9",
  300: "#D3BE9A",
  400: "#B59E76",
  500: "#8F7A55",
  600: "#6F5E40",
  700: "#523F2A",
  800: "#36281A",
  900: "#1F160D",
} as const;

export const LIGHT = {
  surface: RAW.pixelWhite,
  surfaceElevated: "#FDFBF8",
  textPrimary: RAW.terminal,
  textSecondary: RAW.circuitBoard,
  textMuted: WARM[600],
  accent: RAW.dataGreenStrong,
  accentForeground: "#FFFFFF",
  /** Solid primary actions (buttons). Same as accent; survives `.sj-content-reset`. */
  action: RAW.dataGreenStrong,
  actionForeground: "#FFFFFF",
  brand: RAW.dataGreen,
  border: WARM[200],
  borderStrong: WARM[300],
  success: RAW.success,
  successForeground: RAW.successForeground,
  warning: RAW.warning,
  warningForeground: RAW.warningForeground,
  statusBlue: RAW.statusBlue,
} as const;

/** Warm dark grey-brown surfaces; lifted greens for AA (DESIGN.md §16). */
export const DARK = {
  surface: "#222019",
  surfaceElevated: "#252018",
  surfaceSunken: "#1E1914",
  surfaceHover: "#2A241C",
  textPrimary: "#F0E9D9",
  textSecondary: "#C8BBA0",
  textMuted: "#9A8E76",
  accent: "#66B393",
  accentForeground: RAW.terminal,
  /** Solid primary actions (buttons). Same as accent; survives `.sj-content-reset`. */
  action: "#66B393",
  actionForeground: RAW.terminal,
  brand: "#7FB89A",
  border: "#3A332B",
  borderStrong: "#4C443A",
  /** Teal mint — separated from dark accent `#66B393`; use with `successForeground`. */
  success: "#4ECDC4",
  successForeground: RAW.terminal,
  warning: "#E0A94E",
  /** Same band as fill in dark — already AA on dark surfaces. */
  warningForeground: "#E8C078",
  statusBlue: "#6BB3D9",
} as const;
