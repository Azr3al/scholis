export const CARD_MM = { width: 54, height: 86 } as const;

/** SVG coordinate space: 10 user-units per mm. */
export const CARD_VIEWBOX = { width: 540, height: 860 } as const;

/** Legacy card QR image size in viewBox units (~16 mm on a 54 mm-wide card). */
export const LEGACY_QR_VIEWBOX_SIZE = 160;

export const EXPORT_DPI = 300;

/** Pixel size of a full-bleed raster at the given DPI (default print DPI). */
export function cardPixelSize(dpi: number = EXPORT_DPI): { width: number; height: number } {
  const pxPerMm = dpi / 25.4;
  return {
    width: Math.round(CARD_MM.width * pxPerMm),
    height: Math.round(CARD_MM.height * pxPerMm),
  };
}

/** Target QR raster width for legacy card export at the given DPI. */
export function legacyQrExportPixelSize(dpi: number = EXPORT_DPI): number {
  const { width } = cardPixelSize(dpi);
  return Math.round((LEGACY_QR_VIEWBOX_SIZE / CARD_VIEWBOX.width) * width);
}
