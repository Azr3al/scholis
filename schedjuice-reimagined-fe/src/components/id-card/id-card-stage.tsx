"use client";

import { useEffect, useState } from "react";
import { ResolveIdCardFace } from "./resolve-id-card-face";
import { TiltCard } from "./tilt-card";
import { useTenant } from "@/hooks/useTenant";
import { getActiveIdCardTemplateForRole } from "@/lib/id-card/active-template";
import type { CardViewModel } from "@/lib/id-card/types";

type IdCardStageProps = {
  vm: CardViewModel;
  qrDataUrl: string;
};

export function IdCardStage({ vm, qrDataUrl }: IdCardStageProps) {
  const { tenant } = useTenant();
  const template = getActiveIdCardTemplateForRole(tenant, vm.role);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const face = (
    <ResolveIdCardFace
      vm={vm}
      qrDataUrl={qrDataUrl}
      template={template}
      width={300}
      className="drop-shadow-2xl"
    />
  );

  return (
    <div className="flex h-full min-h-[28rem] w-full items-center justify-center p-8">
      {reducedMotion ? face : <TiltCard>{face}</TiltCard>}
    </div>
  );
}
