import type { BackgroundFill } from "./types";

export function coverScale(
  image: { width: number; height: number },
  page: { width: number; height: number },
): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.max(page.width / image.width, page.height / image.height);
}

export function clampBackgroundFill(
  fill: BackgroundFill,
  image: { width: number; height: number },
  page: { width: number; height: number },
): BackgroundFill {
  const minScale = coverScale(image, page);
  const scale = Math.min(Math.max(fill.scale, minScale), minScale * 8);
  const drawnW = image.width * scale;
  const drawnH = image.height * scale;
  const minX = Math.min(0, page.width - drawnW);
  const minY = Math.min(0, page.height - drawnH);
  return {
    ...fill,
    scale,
    offsetX: Math.min(0, Math.max(fill.offsetX, minX)),
    offsetY: Math.min(0, Math.max(fill.offsetY, minY)),
  };
}

export function applyPresetCoverFit(
  fill: BackgroundFill,
  image: { width: number; height: number },
  page: { width: number; height: number },
): BackgroundFill {
  return clampBackgroundFill(fill, image, page);
}
