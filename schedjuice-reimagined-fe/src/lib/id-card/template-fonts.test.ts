import { describe, expect, it } from "vitest";
import {
  formatCanvasFont,
  ID_CARD_TEXT_FONT_FAMILY,
  resolveSlotFontFamily,
} from "@/lib/id-card/template-fonts";
import {
  clampIdCardFontSizePt,
  DEFAULT_ID_CARD_FONT_SIZE_PT,
} from "@/types/id-card-template";

describe("resolveSlotFontFamily", () => {
  it("defaults legacy serif slots to Adobe Caslon Pro", () => {
    expect(resolveSlotFontFamily(undefined)).toBe(ID_CARD_TEXT_FONT_FAMILY);
    expect(resolveSlotFontFamily("serif")).toBe(ID_CARD_TEXT_FONT_FAMILY);
  });

  it("preserves explicit custom families", () => {
    expect(resolveSlotFontFamily("Georgia")).toBe("Georgia");
  });
});

describe("formatCanvasFont", () => {
  it("quotes single family names for canvas", () => {
    expect(formatCanvasFont(24, ID_CARD_TEXT_FONT_FAMILY)).toBe(
      '24px "Adobe Caslon Pro"',
    );
  });

  it("prefixes bold weight when fontStyle is bold", () => {
    expect(formatCanvasFont(24, ID_CARD_TEXT_FONT_FAMILY, "bold")).toBe(
      'bold 24px "Adobe Caslon Pro"',
    );
  });
});

describe("clampIdCardFontSizePt", () => {
  it("clamps to 6–72 pt", () => {
    expect(clampIdCardFontSizePt(4)).toBe(6);
    expect(clampIdCardFontSizePt(80)).toBe(72);
    expect(clampIdCardFontSizePt(DEFAULT_ID_CARD_FONT_SIZE_PT)).toBe(14);
  });
});
