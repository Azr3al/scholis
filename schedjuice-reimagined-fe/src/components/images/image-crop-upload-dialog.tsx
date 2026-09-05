"use client";

import { Button } from "@/components/primitives";
import Image from "next/image";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/primitives/dialog";
import { Slider } from "@/components/primitives/slider";
import {
  ImageCropPreset,
  aspectRatioForPreset,
} from "@/components/images/image-crop-presets";
import {
  useImageUpload,
  type ImageUploadCropShape,
  type UseImageUploadOptions,
} from "@/components/images/use-image-upload";

export type ImageCropUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  cropPreset?: ImageCropPreset;
  cropShape?: ImageUploadCropShape;
  uploadOptions: UseImageUploadOptions;
};

export function ImageCropUploadDialog({
  open,
  onOpenChange,
  title,
  cropPreset,
  cropShape = "rect",
  uploadOptions,
}: ImageCropUploadDialogProps) {
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
    ...uploadOptions,
    cropPreset,
    onUploadFinished: () => {
      uploadOptions.onUploadFinished?.();
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) {
      resetUploadState();
    }
  }, [open, resetUploadState]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetUploadState();
    }
    onOpenChange(next);
  };

  const aspect = cropPreset ? aspectRatioForPreset(cropPreset) : 1;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col gap-4 overflow-y-auto">
          <Dialog.Title>{title}</Dialog.Title>
          {cropPreset ? (
            <Dialog.Description>
              Drag to reposition the photo. Use the slider to zoom in or out, then
              save.
            </Dialog.Description>
          ) : (
            <Dialog.Description>
              Pick an image file from your device, preview it, then save.
            </Dialog.Description>
          )}

          {!file ? (
            <div className="flex justify-center py-2">
              <input
                disabled={busy}
                accept="image/png,image/jpeg,image/webp"
                type="file"
                className="text-sm text-text-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text-primary hover:file:bg-surface-hover"
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
                  "relative mx-auto w-full overflow-hidden rounded-lg bg-surface-sunken",
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
                <p className="text-sm font-medium text-text-primary">Zoom</p>
                <Slider
                  disabled={busy}
                  min={1}
                  max={3}
                  step={0.02}
                  value={zoom}
                  onValueChange={(v) => setZoom(v as number)}
                />
              </div>
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
            <div className="flex justify-end gap-2">
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
}
