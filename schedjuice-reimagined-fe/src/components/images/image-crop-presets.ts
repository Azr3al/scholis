/** Aspect presets for [`ImageUploader`](./image-uploader.tsx) cropping. */
export enum ImageCropPreset {
  Square = "square",
  CoverBanner = "cover_banner",
  /** Matches the ID card photo slot in `id-card-face.tsx` (170 × 210). */
  IdPhoto = "id_photo",
}

/** Width ÷ height for user/org cover crop and masthead banner (2.35:1). */
const COVER_BANNER_ASPECT = 2.35;

/** Width ÷ height for ID card headshots (170 ÷ 210). */
export const ID_PHOTO_ASPECT = 170 / 210;

export function aspectRatioForPreset(preset: ImageCropPreset): number {
  switch (preset) {
    case ImageCropPreset.Square:
      return 1;
    case ImageCropPreset.CoverBanner:
      return COVER_BANNER_ASPECT;
    case ImageCropPreset.IdPhoto:
      return ID_PHOTO_ASPECT;
  }
}
