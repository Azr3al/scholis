import { normalizeBackgroundFill } from "@/lib/image-template/award-document";
import { coverReplaceFill } from "@/lib/image-template/apply-page-preset";
import { clampBackgroundFill, coverScale } from "@/lib/image-template/cover-fit";
import type { BackgroundFill } from "@/lib/image-template/types";

const ID_CARD_MAX_COVER_ZOOM = 8;

export function isUnsetIdCardBackgroundFill(fill: BackgroundFill): boolean {
  const normalized = normalizeBackgroundFill(fill.url, fill);
  return (
    normalized.offsetX === 0 && normalized.offsetY === 0 && normalized.scale === 1
  );
}

/** True when stored inch-space scale is invalid (default placeholder or pre-fix corruption). */
export function idCardFillNeedsCoverFit(
  fill: BackgroundFill,
  imagePx: { width: number; height: number },
  pageInches: { width: number; height: number },
): boolean {
  const normalized = normalizeBackgroundFill(fill.url, fill);
  const minScale = coverScale(imagePx, pageInches);
  return (
    isUnsetIdCardBackgroundFill(normalized) ||
    normalized.scale >= 1 ||
    normalized.scale > minScale * ID_CARD_MAX_COVER_ZOOM
  );
}

export function resolveIdCardBackgroundFill(
  url: string | null,
  rawTransform: unknown,
  imagePx: { width: number; height: number },
  pageInches: { width: number; height: number },
): BackgroundFill {
  const fill = normalizeBackgroundFill(url, rawTransform);
  if (idCardFillNeedsCoverFit(fill, imagePx, pageInches)) {
    return coverReplaceFill(url, imagePx, pageInches);
  }
  return clampBackgroundFill(fill, imagePx, pageInches);
}
