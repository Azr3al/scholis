import { ImageCropPreset } from "@/components/images/image-crop-presets";
import type { ImageUploadCropShape } from "@/components/images/use-image-upload";
import {
  USER_IMAGE_TYPE_LABELS,
  type UserImageType,
} from "@/types/user-image";

export type UserImageUploadTarget = {
  cropPreset: ImageCropPreset;
  cropShape: ImageUploadCropShape;
  title: string;
  successTitle: string;
  successDescription: string;
};

export const USER_IMAGE_UPLOAD_TARGETS: Record<UserImageType, UserImageUploadTarget> = {
  award_image: {
    cropPreset: ImageCropPreset.IdPhoto,
    cropShape: "rect",
    title: USER_IMAGE_TYPE_LABELS.award_image,
    successTitle: "Award Photo updated",
    successDescription: "The award photo has been updated.",
  },
  id_image: {
    cropPreset: ImageCropPreset.IdPhoto,
    cropShape: "rect",
    title: USER_IMAGE_TYPE_LABELS.id_image,
    successTitle: "ID Photo updated",
    successDescription: "The ID photo has been updated.",
  },
};
