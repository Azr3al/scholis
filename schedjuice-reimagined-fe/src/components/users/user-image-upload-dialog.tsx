"use client";

import { useToast } from "@/components/primitives";
import { ImageCropUploadDialog } from "@/components/images/image-crop-upload-dialog";
import { useUserImageUpload } from "@/hooks/use-user-image-upload";
import type { UserImageType } from "@/types/user-image";
import { USER_IMAGE_UPLOAD_TARGETS } from "./user-image-upload-targets";

export type UserImageUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  imageType: UserImageType;
  recordQueryKey: unknown[];
  courseId?: number;
  onUploaded?: () => void;
};

export function UserImageUploadDialog({
  open,
  onOpenChange,
  userId,
  imageType,
  recordQueryKey,
  courseId,
  onUploaded,
}: UserImageUploadDialogProps) {
  const toast = useToast();
  const target = USER_IMAGE_UPLOAD_TARGETS[imageType];
  const { uploadUserImage } = useUserImageUpload({
    userId,
    queryKey: recordQueryKey,
    courseId,
  });

  return (
    <ImageCropUploadDialog
      open={open}
      onOpenChange={onOpenChange}
      title={target.title}
      cropPreset={target.cropPreset}
      cropShape={target.cropShape}
      uploadOptions={{
        mutationFn: (file) => uploadUserImage({ imageType, file }),
        mutationKey: ["uploadUserImage", userId, imageType],
        onUploadFinished: () => {
          toast.add({
            title: target.successTitle,
            description: target.successDescription,
          });
          onUploaded?.();
        },
        onUploadError: () => {
          toast.add({
            title: "Could not save image",
            description:
              "Image upload failed. Please try again later if the problem persists.",
          });
        },
        onPrepareError: () => {
          toast.add({
            title: "Could not prepare image",
            description:
              "This file may be damaged or unsupported. Please try another photo.",
          });
        },
      }}
    />
  );
}
