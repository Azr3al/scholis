"use client";

import { useContext } from "react";
import { cn } from "@/lib/utils";
import { FullscreenContext } from "@/hooks/use-fullscreen";
import {
  PAGE_DENSITY_CLASS,
  resolvePageDensity,
  type PageDensity,
} from "@/lib/layout/page-composition";
import {
  DEFAULT_PAGE_WIDTH,
  resolvePageWidthClass,
  type PageWidth,
} from "@/lib/layout/page-width";

interface PageContainerProps {
  width?: PageWidth;
  density?: PageDensity;
  className?: string;
  children: React.ReactNode;
}

export function pageContentInsetClassName(
  width: PageWidth = DEFAULT_PAGE_WIDTH,
  isFullscreen = false,
) {
  if (isFullscreen) {
    return "w-full min-w-0";
  }
  return cn(
    "mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8",
    resolvePageWidthClass(width, false),
  );
}

export function PageContainer({
  width = DEFAULT_PAGE_WIDTH,
  density,
  className,
  children,
}: PageContainerProps) {
  const effectiveFullscreen =
    useContext(FullscreenContext)?.effectiveFullscreen ?? false;
  const resolvedDensity = resolvePageDensity(density);

  if (effectiveFullscreen) {
    return (
      <div
        className={cn(
          pageContentInsetClassName(width, true),
          "flex h-full min-h-0 flex-1 flex-col",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        pageContentInsetClassName(width, false),
        "flex flex-col border-x border-border",
        PAGE_DENSITY_CLASS[resolvedDensity],
        "transition-[max-width] duration-200 ease-in-out",
        className,
      )}
      data-slot="page-container"
      data-density={resolvedDensity}
    >
      {children}
    </div>
  );
}
