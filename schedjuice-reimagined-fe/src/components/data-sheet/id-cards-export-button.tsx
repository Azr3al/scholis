"use client";

import { Button, useToast } from "@/components/primitives";
import {
  downloadIdCardsZipFromSheetRows,
  getActiveTemplateForAudience,
  type IdCardSheetAudience,
} from "@/helpers/id-cards-export";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useTenant } from "@/hooks/useTenant";
import type { IdPhotoSubjectRow } from "@/types/data-sheets";
import { Download } from "iconoir-react";
import { useState } from "react";

type IdCardsExportButtonProps = {
  audience: IdCardSheetAudience;
  rows: Array<IdPhotoSubjectRow & { roles?: string[] }>;
};

export function IdCardsExportButton({ audience, rows }: IdCardsExportButtonProps) {
  const toast = useToast();
  const { tenant } = useTenant();
  const template = getActiveTemplateForAudience(tenant, audience);
  const [pending, setPending] = useState(false);

  if (!template) return null;

  async function handleDownload() {
    if (!tenant || !template) return;
    setPending(true);
    try {
      await downloadIdCardsZipFromSheetRows({
        rows,
        tenant,
        audience,
        template,
        origin: window.location.origin,
      });
    } catch (err) {
      const detail = parseSchedjuiceApiError(err, "");
      toast.add({
        title: "Download failed",
        description: detail || "Please try again.",
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-9 shrink-0 gap-1.5"
      isLoading={pending}
      disabled={pending || rows.length === 0}
      onClick={() => void handleDownload()}
    >
      <Download className="size-4" aria-hidden />
      Download ID cards
    </Button>
  );
}
