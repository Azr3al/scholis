"use client";

import { StudioMobileSections } from "@/components/studio/record/studio-mobile-sections";
import { StudioSectionRail } from "@/components/studio/record/studio-section-rail";
import { useContextRail } from "@/components/shell/use-context-rail";
import { STUDIO_CONTEXT_PARENT } from "@/config/studio-record-nav";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function StudioRecordRailProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canAny } = usePermissions();

  const canDocuments = canAny(["document_template.manage"]);
  const canAwards = canAny(["award_title.manage"]);

  useContextRail(
    StudioSectionRail,
    () => ({ pathname, canDocuments, canAwards }),
    STUDIO_CONTEXT_PARENT,
  );

  return (
    <>
      <div className={cn(pageContentInsetClassName(), "pt-4 md:hidden")}>
        <StudioMobileSections
          canDocuments={canDocuments}
          canAwards={canAwards}
        />
      </div>
      {children}
    </>
  );
}
