"use client";

import { useEffect, useState } from "react";
import { renderIdCardTemplateToDataUrl } from "@/lib/id-card/render-template";
import type { CardViewModel } from "@/lib/id-card/types";
import { cn } from "@/lib/utils";
import {
  IdCardTemplateSide,
  type IdCardTemplateSummary,
} from "@/types/id-card-template";

type IdCardTemplateFaceProps = {
  template: IdCardTemplateSummary;
  vm: CardViewModel;
  qrDataUrl: string;
  width?: number;
  className?: string;
  side?: IdCardTemplateSide;
};

export function IdCardTemplateFace({
  template,
  vm,
  qrDataUrl,
  width = 320,
  className,
  side = IdCardTemplateSide.front,
}: IdCardTemplateFaceProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const aspect =
    Number(template.height_in) / Math.max(Number(template.width_in), 0.001);
  const height = width * aspect;

  useEffect(() => {
    let active = true;
    setDataUrl(null);
    renderIdCardTemplateToDataUrl({ template, vm, qrDataUrl, side })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [template, vm, qrDataUrl, side]);

  const sideLabel = side === IdCardTemplateSide.back ? "back" : "front";

  if (!dataUrl) {
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-busy="true"
        aria-label="Loading ID card preview"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={`${vm.name} ID card (${sideLabel})`}
      width={width}
      height={height}
      className={cn("block h-auto max-w-full", className)}
    />
  );
}
