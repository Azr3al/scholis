"use client";

import { AdmissionsMobileSections } from "@/components/admissions/record/admissions-mobile-sections";
import { AdmissionsSectionRail } from "@/components/admissions/record/admissions-section-rail";
import { useContextRail } from "@/components/shell/use-context-rail";
import { ADMISSIONS_CONTEXT_PARENT } from "@/config/admissions-record-nav";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AdmissionsRecordRailProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  useContextRail(
    AdmissionsSectionRail,
    () => ({ pathname }),
    ADMISSIONS_CONTEXT_PARENT,
  );

  return (
    <>
      <div className={cn(pageContentInsetClassName(), "pt-4 md:hidden")}>
        <AdmissionsMobileSections />
      </div>
      {children}
    </>
  );
}
