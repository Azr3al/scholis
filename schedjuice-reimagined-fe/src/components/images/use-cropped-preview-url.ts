"use client";

import { useEffect, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import { getCroppedImageBlob } from "./canvas-crop";
import { previewLogoUrlForCrop } from "./preview-logo-url-for-crop";
import { outputMimeForFile } from "./use-image-upload";

export const CROPPED_PREVIEW_DEBOUNCE_MS = 150;

type UseCroppedPreviewUrlArgs = {
  imageSrc: string | null;
  croppedAreaPixels: Area | null;
  file: File | null;
};

export function useCroppedPreviewUrl({
  imageSrc,
  croppedAreaPixels,
  file,
}: UseCroppedPreviewUrlArgs): string | null {
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const revokeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!imageSrc || !croppedAreaPixels || !file) {
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
      setCroppedPreviewUrl(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const mimeType = outputMimeForFile(file);
          const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, {
            mimeType,
            quality: 0.92,
            maxLongEdge: 512,
          });
          if (!active) return;
          const url = URL.createObjectURL(blob);
          if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
          revokeRef.current = url;
          setCroppedPreviewUrl(url);
        } catch {
          if (active) setCroppedPreviewUrl(null);
        }
      })();
    }, CROPPED_PREVIEW_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [imageSrc, croppedAreaPixels, file]);

  useEffect(() => {
    return () => {
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
    };
  }, []);

  return previewLogoUrlForCrop(imageSrc, croppedAreaPixels, croppedPreviewUrl);
}
