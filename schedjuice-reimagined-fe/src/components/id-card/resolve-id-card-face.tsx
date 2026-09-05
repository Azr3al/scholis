"use client";

import { IdCardFace } from "@/components/id-card/id-card-face";
import { IdCardTemplateFace } from "@/components/id-card/id-card-template-face";
import type { CardViewModel } from "@/lib/id-card/types";
import type { IdCardTemplateSummary } from "@/types/id-card-template";

type ResolveIdCardFaceProps = {
  vm: CardViewModel;
  qrDataUrl: string;
  template: IdCardTemplateSummary | null | undefined;
  width?: number;
  className?: string;
};

export function ResolveIdCardFace({
  vm,
  qrDataUrl,
  template,
  width = 320,
  className,
}: ResolveIdCardFaceProps) {
  if (template) {
    return (
      <IdCardTemplateFace
        template={template}
        vm={vm}
        qrDataUrl={qrDataUrl}
        width={width}
        className={className}
      />
    );
  }

  return (
    <IdCardFace
      vm={vm}
      qrDataUrl={qrDataUrl}
      width={width}
      className={className}
    />
  );
}
