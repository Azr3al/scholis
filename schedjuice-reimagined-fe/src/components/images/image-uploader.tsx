"use client";
import { Button, Dialog, Input, Slider, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import Image from "next/image";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import type { ComponentType } from "react";
import { useCallback } from "react";
import "react-easy-crop/react-easy-crop.css";
import { cn } from "@/lib/utils";
import {
  collectClipboardFiles,
  filterFilesForAttachments,
} from "@/components/attachment-uploader/attachment-dropzone-files";
import {
  ImageCropPreset,
  aspectRatioForPreset,
} from "./image-crop-presets";
import {
  useImageUpload,
  type ImageUploadCropShape,
} from "./use-image-upload";

export type ImageUploaderCropShape = ImageUploadCropShape;

interface ImageUploaderProps {
  onUploadFinished: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  entityId: number | string;
  entity: string;
  uploadKey: string;
  cropPreset?: ImageCropPreset;
  cropShape?: ImageUploaderCropShape;
  dialogTitle?: string;
  renderAfterCrop?: ComponentType<{
    imageSrc: string;
    croppedAreaPixels: Area | null;
    file: File;
  }>;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUploadFinished,
  isOpen,
  setIsOpen,
  entityId,
  entity,
  uploadKey,
  cropPreset,
  cropShape = "rect",
  dialogTitle,
  renderAfterCrop,
}) => {
  const toast = useToast();

  const {
    file,
    imageSrc,
    crop,
    setCrop,
    zoom,
    setZoom,
    croppedAreaPixels,
    setCroppedAreaPixels,
    busy,
    bindSelectedFile,
    resetUploadState,
    handleSubmit,
  } = useImageUpload({
    entity,
    entityId,
    uploadKey,
    cropPreset,
    onUploadFinished: () => {
      onUploadFinished();
      setIsOpen(false);
    },
    onUploadError: () => {
      toast.add({
        type: "error",
        title: "Could not save image",
        description:
          "Image upload failed. Please try again later if the problem persists.",
      });
    },
    onPrepareError: () => {
      toast.add({
        type: "error",
        title: "Could not prepare image",
        description:
          "This file may be damaged or unsupported. Please try another photo.",
      });
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetUploadState();
    }
    setIsOpen(open);
  };

  const aspect = cropPreset ? aspectRatioForPreset(cropPreset) : 1;

  const resolvedTitle =
    dialogTitle ??
    (cropPreset ? "Adjust your photo" : "Choose an image");

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (file || busy) return;
      const clipboardFiles = collectClipboardFiles(e.clipboardData);
      if (clipboardFiles.length === 0) return;

      const { accepted, rejected } = filterFilesForAttachments(
        clipboardFiles,
        { isImageOnly: true, remainingSlots: 1 },
      );

      if (rejected.length > 0 && accepted.length === 0) {
        e.preventDefault();
        toast.add({
          type: "error",
          title: "Images only",
          description:
            "Paste only works with copied images (screenshots or photos).",
        });
        return;
      }

      if (accepted.length === 0) return;
      e.preventDefault();
      bindSelectedFile(accepted[0] ?? null);
    },
    [bindSelectedFile, busy, file, toast],
  );

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup
        className={cn(
          "flex max-h-[min(90vh,720px)] max-sm:min-h-full max-sm:min-w-full min-w-[min(100vw-2rem,440px)] flex-col gap-4 overflow-y-auto",
          renderAfterCrop ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
        onPaste={handlePaste}
      >
        <div>
          <Dialog.Title>{resolvedTitle}</Dialog.Title>
          {cropPreset ? (
            <Dialog.Description>
              Drag to reposition the photo. Use the slider to zoom in or out
              {renderAfterCrop
                ? ". Previews below show how your logo will look across Schedjuice."
                : ", then save."}
            </Dialog.Description>
          ) : (
            <Dialog.Description>
              Pick an image file from your device, paste from clipboard, preview
              it, then save.
            </Dialog.Description>
          )}
        </div>

        {!file ? (
          <div className="flex justify-center py-4">
            <Input
              disabled={busy}
              accept="image/*"
              type="file"
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (next) bindSelectedFile(next);
                e.target.value = "";
              }}
            />
          </div>
        ) : cropPreset && imageSrc ? (
          <div className="flex flex-col gap-4" aria-busy={busy}>
            <div
              className={cn(
                "relative mx-auto w-full overflow-hidden rounded-lg bg-muted",
                aspect >= 1
                  ? "max-w-[min(100%,520px)]"
                  : "max-w-[360px] max-h-[min(70vh,480px)]",
              )}
              style={{ aspectRatio: `${aspect} / 1` }}
            >
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={cropShape === "round" ? "round" : "rect"}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedPixels) =>
                  setCroppedAreaPixels(croppedPixels)
                }
              />
            </div>
            <div className="space-y-2 px-1">
              <p className="text-sm font-medium text-foreground">Zoom</p>
              <Slider
                disabled={busy}
                min={1}
                max={3}
                step={0.02}
                value={[zoom]}
                onValueChange={(v) =>
                  setZoom(Array.isArray(v) ? (v[0] ?? 1) : v)
                }
              />
            </div>
            {renderAfterCrop && file && imageSrc ? (
              (() => {
                const AfterCrop = renderAfterCrop;
                return (
                  <AfterCrop
                    imageSrc={imageSrc}
                    croppedAreaPixels={croppedAreaPixels}
                    file={file}
                  />
                );
              })()
            ) : null}
          </div>
        ) : (
          imageSrc && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="relative aspect-square w-full max-w-[300px] overflow-hidden rounded-lg">
                <Image
                  unoptimized
                  src={imageSrc}
                  width={300}
                  height={300}
                  alt="Selected image preview"
                  className="size-full object-cover"
                />
              </div>
            </div>
          )
        )}

        {file ? (
          <div className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => bindSelectedFile(null)}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={busy || (Boolean(cropPreset) && !croppedAreaPixels)}
              isLoading={busy}
              onClick={() => void handleSubmit()}
            >
              Save
            </Button>
          </div>
        ) : null}
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ImageUploader;
