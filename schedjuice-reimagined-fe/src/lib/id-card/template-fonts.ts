import {
  IdCardSlotType,
  clampIdCardFontSizePt,
  DEFAULT_ID_CARD_FONT_SIZE_PT,
  type IdCardFontStyle,
  type IdCardTemplateSlot,
} from "@/types/id-card-template";

/** Primary serif for custom ID card template text slots. */
export const ID_CARD_TEXT_FONT_FAMILY = "Adobe Caslon Pro";

const LEGACY_ID_CARD_FONT_FAMILIES = new Set(["serif", "Schedjuice Serif"]);

export function resolveSlotFontFamily(fontFamily?: string): string {
  if (!fontFamily || LEGACY_ID_CARD_FONT_FAMILIES.has(fontFamily)) {
    return ID_CARD_TEXT_FONT_FAMILY;
  }
  return fontFamily;
}

export function formatCanvasFont(
  sizePx: number,
  fontFamily: string,
  fontStyle?: IdCardFontStyle,
): string {
  const weight = fontStyle === "bold" ? "bold " : "";
  if (fontFamily.includes(",")) {
    return `${weight}${sizePx}px ${fontFamily}`;
  }
  return `${weight}${sizePx}px "${fontFamily}"`;
}

/** Wait for template fonts before canvas text draw (export/preview). */
export async function ensureIdCardFontsLoaded(
  slots: IdCardTemplateSlot[],
  dpi: number,
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;

  const loads = new Set<string>();
  for (const slot of slots) {
    if (slot.type !== IdCardSlotType.text && slot.type !== IdCardSlotType.staticText) {
      continue;
    }
    const fontSizePx =
      (clampIdCardFontSizePt(slot.fontSizePt ?? DEFAULT_ID_CARD_FONT_SIZE_PT) * dpi) /
      72;
    const family = resolveSlotFontFamily(slot.fontFamily);
    loads.add(formatCanvasFont(fontSizePx, family, slot.fontStyle));
  }

  if (loads.size === 0) {
    loads.add(formatCanvasFont(16, ID_CARD_TEXT_FONT_FAMILY));
  }

  try {
    await Promise.all(Array.from(loads).map((spec) => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch {
    // Best-effort; canvas falls back when the face is unavailable.
  }
}
