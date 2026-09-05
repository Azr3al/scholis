"use client";

import { useToast } from "@/components/primitives";
import { ImageCropUploadDialog } from "@/components/images/image-crop-upload-dialog";
import {
  ImageCropPreset,
} from "@/components/images/image-crop-presets";
import type { ImageUploadCropShape } from "@/components/images/use-image-upload";

export type RecordImageUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: number | string;
  uploadKey: string;
  cropPreset?: ImageCropPreset;
  cropShape?: ImageUploadCropShape;
  title: string;
  onUploaded: () => void;
};

export function RecordImageUploadDialog({
  open,
  onOpenChange,
  entityId,
  uploadKey,
  cropPreset,
  cropShape = "rect",
  title,
  onUploaded,
}: RecordImageUploadDialogProps) {
  const toast = useToast();

  return (
    <ImageCropUploadDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      cropPreset={cropPreset}
      cropShape={cropShape}
      uploadOptions={{
        entity: "users",
        entityId,
        uploadKey,
        onUploadFinished: onUploaded,
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
