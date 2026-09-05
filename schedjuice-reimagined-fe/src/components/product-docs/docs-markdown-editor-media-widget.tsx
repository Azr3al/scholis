"use client";

import { VideoEmbed } from "@/components/markdown/video-embed";
import type { ParsedMediaLine } from "@/lib/product-docs/media-markdown";

export function DocsMarkdownEditorMediaWidget({ media }: { media: ParsedMediaLine }) {
  if (media.type === "video") {
    return (
      <div className="my-3">
        <VideoEmbed src={media.url} title={media.title} />
      </div>
    );
  }
  return (
    <div className="my-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url}
        alt={media.alt}
        className="max-h-96 max-w-full rounded-lg border border-border"
      />
    </div>
  );
}
