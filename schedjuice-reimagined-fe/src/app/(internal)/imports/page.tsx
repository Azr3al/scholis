"use client";

import { PageContainer } from "@/components/layout/page-container";
import "@glideapps/glide-data-grid/dist/index.css";

import { MapStep } from "@/components/import-wizard/map-step";
import { ReviewStep } from "@/components/import-wizard/review-step";
import { UploadStep } from "@/components/import-wizard/upload-step";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useFullscreen } from "@/hooks/use-fullscreen";
import useImportStore from "@/store/import-store";
import { useMemo } from "react";

export default function ImportWizardPage() {
  const step = useImportStore((s) => s.step);
  const parse = useImportStore((s) => s.parse);
  const reset = useImportStore((s) => s.reset);
  const { effectiveFullscreen } = useFullscreen();
  const hidePageChrome = effectiveFullscreen && step === "review";

  const headerConfig = useMemo(
    () =>
      hidePageChrome
        ? null
        : {
            breadcrumb: (
              <h1 className="font-serif text-lg text-text-primary">Import</h1>
            ),
            actions:
              step !== "upload" ? (
                <Button type="button" variant="secondary" size="sm" onClick={reset}>
                  Discard import
                </Button>
              ) : undefined,
          },
    [hidePageChrome, reset, step],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide" className={hidePageChrome ? undefined : "space-y-6"}>
      {step === "upload" && <UploadStep />}
      {step === "map" && parse && <MapStep />}
      {step === "review" && parse && <ReviewStep />}
    </PageContainer>
  );
}
