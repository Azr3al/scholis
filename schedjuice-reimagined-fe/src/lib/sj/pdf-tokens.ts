/**

 * Schedjuice PDF tokens — mirrors DESIGN.md §5/§6 via palette.ts.

 * Use for @react-pdf/renderer documents only.

 */

import { LIGHT, RAW, WARM } from "@/lib/sj/palette";



export const PDF = {

  surface: LIGHT.surface,

  surfaceElevated: LIGHT.surfaceElevated,

  textPrimary: LIGHT.textPrimary,

  textSecondary: LIGHT.textSecondary,

  textMuted: LIGHT.textMuted,

  accent: LIGHT.accent,

  brand: LIGHT.brand,

  border: LIGHT.border,

  borderStrong: LIGHT.borderStrong,

  accentForeground: LIGHT.accentForeground,

  /** Tabular amount emphasis — same hue family as accent. */

  amount: RAW.dataGreenStrong,

} as const;



/** Minimum data-table row height (DESIGN.md §9 — 52px). */

export const PDF_TABLE_ROW_MIN_HEIGHT = 52;



/** Warm label wash for section headers — not cool gray SaaS chrome. */

export const PDF_SECTION_LABEL_BG = WARM[100];



/** @deprecated Use preparePdfFonts() — font families depend on available TTF files. */

export const PDF_FONT = {

  sans: "Helvetica",

  serif: "Helvetica-Bold",

  mono: "Courier",

} as const;



export type { PdfFontFamilies } from "@/lib/sj/register-pdf-fonts";

export {

  PDF_FONT_BUILTIN,

  PDF_FONT_SCHEDJUICE,

  preparePdfFonts,

} from "@/lib/sj/register-pdf-fonts";

