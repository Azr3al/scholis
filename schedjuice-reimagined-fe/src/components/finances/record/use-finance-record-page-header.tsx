"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePageHeader } from "@/components/shell/use-page-header";
import type { PageHeaderConfig } from "@/components/shell/sidebar-context";
import {
  FINANCE_CONTEXT_PARENT,
  financeRecordPageTitle,
  financeRecordSubRouteLabel,
} from "@/config/finance-record-nav";

function FinanceRecordBreadcrumb({ pathname }: { pathname: string }) {
  const section = financeRecordPageTitle(pathname);
  const sub = financeRecordSubRouteLabel(pathname);
  const onOverview = pathname === "/finances";

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-sm"
    >
      {!onOverview ? (
        <>
          <Link
            href={FINANCE_CONTEXT_PARENT.href}
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          >
            {FINANCE_CONTEXT_PARENT.label}
          </Link>
          <span className="shrink-0 text-text-muted" aria-hidden>
            /
          </span>
        </>
      ) : null}
      <span className="truncate font-serif text-lg text-text-primary">{section}</span>
      {sub ? (
        <>
          <span className="shrink-0 text-text-muted" aria-hidden>
            /
          </span>
          <span className="truncate text-text-secondary">{sub}</span>
        </>
      ) : null}
    </nav>
  );
}

export type FinancePageHeaderConfig = Omit<PageHeaderConfig, "breadcrumb">;

/** Register finance breadcrumb plus optional toolbar/actions for the current route. */
export function useFinancePageHeader(config?: FinancePageHeaderConfig) {
  const pathname = usePathname();

  const pageHeader = useMemo(
    () => ({
      breadcrumb: <FinanceRecordBreadcrumb pathname={pathname} />,
      actions: config?.actions,
      toolbar: config?.toolbar,
      toolbarSecondary: config?.toolbarSecondary,
    }),
    [
      pathname,
      config?.actions,
      config?.toolbar,
      config?.toolbarSecondary,
    ],
  );

  usePageHeader(pageHeader);
}

/** Default finance header for layout fallback (pages without their own header hook). */
export function FinanceLayoutHeader() {
  useFinancePageHeader();
  return null;
}
