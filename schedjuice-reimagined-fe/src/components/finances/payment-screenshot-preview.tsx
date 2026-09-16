"use client";

import type { extendedFileType } from "@/components/form/file-drag-and-drop";
import { Button } from "@/components/primitives/button";
import Image from "next/image";
import { useEffect, useState } from "react";

type PaymentScreenshotPreviewProps = {
  file: extendedFileType | undefined;
  onView: (url: string) => void;
  onClear?: () => void;
  clearDisabled?: boolean;
};

export function PaymentScreenshotPreview({
  file,
  onView,
  onClear,
  clearDisabled = false,
}: PaymentScreenshotPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file && "file" in file && file.is_image) {
      const url = URL.createObjectURL(file.file);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    setPreviewUrl(null);
    return;
  }, [file]);

  if (previewUrl) {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            Receipt preview — click to enlarge
          </p>
          {onClear ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto shrink-0 px-2 py-1 text-xs text-danger hover:bg-danger/10 hover:text-danger"
              disabled={clearDisabled}
              onClick={onClear}
            >
              Clear screenshot
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          className="relative mx-auto block w-full max-w-sm overflow-hidden rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => onView(previewUrl)}
        >
          <Image
            unoptimized
            src={previewUrl}
            alt="Screenshot preview"
            width={1200}
            height={1200}
            className="mx-auto max-h-[min(24rem,70vh)] w-full object-contain"
          />
        </button>
      </div>
    );
  }

  if (file && "file" in file && !file.is_image) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-text-muted">
          Preview is not available for this file type.
        </p>
        {onClear ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-2 py-1 text-xs text-danger hover:bg-danger/10 hover:text-danger"
            disabled={clearDisabled}
            onClick={onClear}
          >
            Clear screenshot
          </Button>
        ) : null}
      </div>
    );
  }

  return null;
}
