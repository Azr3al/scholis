import { paletteForKind } from "./palette";
import type { PaletteItem, TemplateKind } from "./types";

const IMAGE_PALETTE_KEYS = new Set(["photo", "mt_signature", "user_signature", "qr"]);

export function isImagePaletteKey(key: string): boolean {
  return IMAGE_PALETTE_KEYS.has(key);
}

export function insertChromeForKind(kind: TemplateKind): {
  showPhoto: boolean;
  fieldItems: PaletteItem[];
} {
  const items = paletteForKind(kind);
  const showPhoto = kind === "id_card" && items.some((item) => item.key === "photo");
  return {
    showPhoto,
    fieldItems: items
      .filter((item) => item.key !== "text" && !(showPhoto && item.key === "photo"))
      .map((item) => ({
        ...item,
        visual: isImagePaletteKey(item.key) ? "image" : "text",
      })),
  };
}
