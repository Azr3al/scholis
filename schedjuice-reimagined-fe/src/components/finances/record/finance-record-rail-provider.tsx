"use client";

import { FinanceMobileSections } from "@/components/finances/record/finance-mobile-sections";
import { FinanceSectionRail } from "@/components/finances/record/finance-section-rail";
import { useContextRail } from "@/components/shell/use-context-rail";
import { FINANCE_CONTEXT_PARENT } from "@/config/finance-record-nav";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function FinanceRecordRailProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { tenant } = useTenant();
  const { canAny } = usePermissions();

  useContextRail(
    FinanceSectionRail,
    () =>
      tenant
        ? {
            pathname,
            user,
            tenant,
            canAny,
          }
        : null,
    FINANCE_CONTEXT_PARENT,
  );

  return (
    <>
      {tenant ? (
        <div className={cn(pageContentInsetClassName(), "pt-4 md:hidden")}>
          <FinanceMobileSections user={user} tenant={tenant} canAny={canAny} />
        </div>
      ) : null}
      {children}
    </>
  );
}
