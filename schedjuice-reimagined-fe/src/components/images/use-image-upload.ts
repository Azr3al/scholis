"use client";

import { updateEntity } from "@/app/client-api/utils";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import { getCroppedImageBlob } from "./canvas-crop";
import type { ImageCropPreset } from "./image-crop-presets";

export type ImageUploadCropShape = "rect" | "round";

export function outputMimeForFile(file: File): string {
  if (file.type === "image/png") return "image/png";
  if (file.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

export function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

type UseImageUploadBaseOptions = {
  cropPreset?: ImageCropPreset;
  onUploadFinished?: () => void;
  onUploadError?: () => void;
  onPrepareError?: () => void;
};

export type UseImageUploadEntityOptions = UseImageUploadBaseOptions & {
  entity: string;
  entityId: number | string;
  uploadKey: string;
  mutationFn?: undefined;
  mutationKey?: undefined;
};

export type UseImageUploadMutationOptions = UseImageUploadBaseOptions & {
  mutationFn: (file: File) => Promise<unknown>;
  mutationKey?: unknown[];
  entity?: undefined;
  entityId?: undefined;
  uploadKey?: undefined;
};

export type UseImageUploadOptions =
  | UseImageUploadEntityOptions
  | UseImageUploadMutationOptions;

export function useImageUpload(options: UseImageUploadOptions) {
  const {
    cropPreset,
    onUploadFinished,
    onUploadError,
    onPrepareError,
    mutationFn,
    mutationKey,
    entity,
    entityId,
    uploadKey,
  } = options;
  const imageSrcRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);

  const clearBlobUrl = useCallback(() => {
    if (imageSrcRef.current) {
      URL.revokeObjectURL(imageSrcRef.current);
      imageSrcRef.current = null;
    }
    setImageSrc(null);
  }, []);

  const resetUploadState = useCallback(() => {
    clearBlobUrl();
    setFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsPreparingCrop(false);
  }, [clearBlobUrl]);

  useEffect(() => {
    return () => {
      if (imageSrcRef.current) {
        URL.revokeObjectURL(imageSrcRef.current);
        imageSrcRef.current = null;
      }
    };
  }, []);

  const bindSelectedFile = useCallback(
    (next: File | null) => {
      clearBlobUrl();
      setFile(next);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      if (next) {
        const url = URL.createObjectURL(next);
        imageSrcRef.current = url;
        setImageSrc(url);
      }
    },
    [clearBlobUrl],
  );

  const imageUploadMutation = useMutation({
    mutationKey: mutationFn
      ? (mutationKey ?? ["uploadImage", "custom"])
      : ["uploadImage", entity, entityId, uploadKey],
    mutationFn: (uploadFile: File) => {
      if (mutationFn) {
        return mutationFn(uploadFile);
      }
      const formData = new FormData();
      formData.append(uploadKey!, uploadFile);
      return updateEntity(entity!, entityId!, formData);
    },
    onSuccess: () => {
      onUploadFinished?.();
      resetUploadState();
    },
    onError: () => {
      onUploadError?.();
    },
  });

  const busy = imageUploadMutation.isLoading || isPreparingCrop;

  const handleSubmit = useCallback(async () => {
    if (!file || !imageSrc) return;

    if (cropPreset) {
      if (!croppedAreaPixels) return;
      setIsPreparingCrop(true);
      try {
        const mimeType = outputMimeForFile(file);
        const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, {
          mimeType,
          quality: 0.92,
        });
        const ext = extensionForMime(mimeType);
        const baseName = file.name.replace(/\.[^/.]+$/, "").trim() || "image";
        const outFile = new File([blob], `${baseName}.${ext}`, {
          type: mimeType,
        });
        imageUploadMutation.mutate(outFile);
      } catch {
        onPrepareError?.();
      } finally {
        setIsPreparingCrop(false);
      }
      return;
    }

    imageUploadMutation.mutate(file);
  }, [
    file,
    imageSrc,
    cropPreset,
    croppedAreaPixels,
    imageUploadMutation,
    onPrepareError,
  ]);

  return {
    file,
    imageSrc,
    crop,
    setCrop,
    zoom,
    setZoom,
    croppedAreaPixels,
    setCroppedAreaPixels,
    isPreparingCrop,
    busy,
    bindSelectedFile,
    resetUploadState,
    handleSubmit,
  };
}
