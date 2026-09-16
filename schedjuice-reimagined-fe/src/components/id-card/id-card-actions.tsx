"use client";
import { Button, useToast } from "@/components/primitives";

import { useState } from "react";
import { Download } from "iconoir-react";
import { downloadCardPdf, downloadCardPng } from "@/helpers/id-card-export";
import { useTenant } from "@/hooks/useTenant";
import { getActiveIdCardTemplateForRole } from "@/lib/id-card/active-template";
import type { CardViewModel } from "@/lib/id-card/types";

type IdCardActionsProps = {
  vm: CardViewModel;
  qrDataUrl: string;
};

export function IdCardActions({ vm, qrDataUrl }: IdCardActionsProps) {
  const toast = useToast();
  const { tenant } = useTenant();
  const template = getActiveIdCardTemplateForRole(tenant, vm.role);
  const [pending, setPending] = useState<"png" | "pdf" | null>(null);

  async function run(kind: "png" | "pdf") {
    setPending(kind);
    try {
      const options = { template };
      if (kind === "png") await downloadCardPng(vm, qrDataUrl, options);
      else await downloadCardPdf(vm, qrDataUrl, options);
    } catch {
      toast.add({
        title: "Download failed",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="primary" isLoading={pending === "pdf"}
        disabled={pending !== null}
        onClick={() => run("pdf")}
      >
        <Download className="size-4" aria-hidden />
        Download PDF
      </Button>
      <Button
        variant="secondary" isLoading={pending === "png"}
        disabled={pending !== null}
        onClick={() => run("png")}
      >
        <Download className="size-4" aria-hidden />
        Download PNG
      </Button>
    </div>
  );
}
