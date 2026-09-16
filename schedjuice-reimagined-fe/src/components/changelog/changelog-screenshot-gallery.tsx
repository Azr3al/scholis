"use client";

import { ChangelogScreenshotLightbox } from "@/components/changelog/changelog-screenshot-lightbox";
import type { ChangelogScreenshot } from "@/content/changelog/types";
import { cn } from "@/lib/utils";
import { ZoomIn } from "iconoir-react";
import Image from "next/image";
import { useState } from "react";

type ChangelogScreenshotGalleryProps = {
  screenshots: ChangelogScreenshot[];
  className?: string;
};

export function ChangelogScreenshotGallery({
  screenshots,
  className,
}: ChangelogScreenshotGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (screenshots.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          screenshots.length === 1 && "sm:grid-cols-1",
          className,
        )}
      >
        {screenshots.map((shot, index) => (
          <figure
            key={shot.src}
            className="overflow-hidden rounded-2xl border border-border/60 bg-surface-sunken/20"
          >
            <button
              type="button"
              aria-label={`View larger: ${shot.alt}`}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "group relative block w-full cursor-pointer transition-transform active:scale-[0.99]",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <div className="relative aspect-[16/10] w-full bg-surface-sunken/40">
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  fill
                  unoptimized
                  className="object-cover object-top transition-opacity duration-200 group-hover:opacity-80"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center bg-zinc-950/0 transition-colors duration-200 group-hover:bg-zinc-950/20"
                >
                  <ZoomIn
                    className="size-6 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    strokeWidth={1.5}
                  />
                </span>
              </div>
            </button>
            {shot.caption ? (
              <figcaption className="border-t border-border/50 px-4 py-2.5 text-xs text-text-muted">
                {shot.caption}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>

      <ChangelogScreenshotLightbox
        screenshots={screenshots}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
      />
    </>
  );
}
