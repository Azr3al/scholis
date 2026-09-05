import { ImageCropPreset } from "@/components/images/image-crop-presets";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type ProfileUploadTarget = {
  uploadKey: "profile_image" | "cover_image" | "id_photo";
  cropPreset: ImageCropPreset;
  cropShape: "rect" | "round";
  title: string;
  successTitle: string;
  successDescription: string;
};

export const PROFILE_UPLOAD_TARGETS = {
  profile: {
    uploadKey: "profile_image",
    cropPreset: ImageCropPreset.Square,
    cropShape: "round",
    title: "Profile photo",
    successTitle: "Profile photo updated",
    successDescription: "Your profile photo has been updated.",
  },
  cover: {
    uploadKey: "cover_image",
    cropPreset: ImageCropPreset.CoverBanner,
    cropShape: "rect",
    title: "Cover image",
    successTitle: "Cover image updated",
    successDescription: "Your cover image has been updated.",
  },
  idPhoto: {
    uploadKey: "id_photo",
    cropPreset: ImageCropPreset.IdPhoto,
    cropShape: "rect",
    title: "ID photo",
    successTitle: "ID photo updated",
    successDescription: "The ID card photo has been updated.",
  },
} as const satisfies Record<string, ProfileUploadTarget>;

export function resolveCoverSrc(
  subject: accountType,
  tenant: organizationType | null,
): string {
  if (subject.cover_image) return subject.cover_image;
  const d = tenant?.default_cover_image;
  if (typeof d === "string" && d.length > 0) return d;
  return "/images/default-cover.jpg";
}

export function resolveProfileSrc(subject: accountType): string | null {
  return subject.profile_image || null;
}
