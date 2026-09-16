import type { Area } from "react-easy-crop";

/** Pure selection logic — testable without React or upload deps. */
export function previewLogoUrlForCrop(
  imageSrc: string | null,
  croppedAreaPixels: Area | null,
  croppedPreviewUrl: string | null,
): string | null {
  if (croppedPreviewUrl) return croppedPreviewUrl;
  if (imageSrc) return imageSrc;
  return null;
}
