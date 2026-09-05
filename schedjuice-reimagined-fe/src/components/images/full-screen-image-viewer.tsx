"use client";

import { ImageLightbox } from "@/components/images/image-lightbox";

export default function FullScreenImageViewer({
  imageUrl,
  title = "Screenshot",
  onClose,
}: {
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}) {
  return (
    <ImageLightbox imageUrl={imageUrl} title={title} onClose={onClose} />
  );
}
