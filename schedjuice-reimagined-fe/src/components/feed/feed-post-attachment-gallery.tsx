"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Page as FileIcon } from "iconoir-react";

import { ImageLightbox } from "@/components/images/image-lightbox";
import type { attachmentType } from "@/types/attachment";
import {
  getAttachmentUrl,
  isAttachmentImage,
} from "@/lib/attachment/attachment-url";

export function FeedPostAttachmentGallery({
  attachments,
}: {
  attachments: attachmentType[];
}) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const imageAttachments = useMemo(
    () => attachments.filter(isAttachmentImage),
    [attachments],
  );
  const nonImageAttachments = useMemo(
    () => attachments.filter((f) => !isAttachmentImage(f)),
    [attachments],
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <ImageLightbox
        imageUrl={selectedImage}
        title="Attachment preview"
        onClose={() => setSelectedImage(null)}
      />

      <div className="space-y-3">
        {imageAttachments.length > 0 && (
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex w-max gap-2">
              {imageAttachments.map((file, index) => {
                const url = getAttachmentUrl(file);
                return (
                  <button
                    key={file.id ?? index}
                    type="button"
                    className="h-[200px] w-[160px] flex-shrink-0 overflow-hidden rounded-lg bg-muted"
                    onClick={() => setSelectedImage(url)}
                  >
                    <Image
                      unoptimized
                      src={url}
                      alt={file.filename || `Image ${index + 1}`}
                      width={160}
                      height={200}
                      className="h-full w-full object-cover transition-opacity hover:opacity-90"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {nonImageAttachments.length > 0 && (
          <ul className="space-y-2">
            {nonImageAttachments.map((file, index) => {
              const url = getAttachmentUrl(file);
              return (
                <li key={file.id ?? index}>
                  <Link
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileIcon className="h-4 w-4 shrink-0" aria-hidden />
                    {file.filename || "Attachment"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
