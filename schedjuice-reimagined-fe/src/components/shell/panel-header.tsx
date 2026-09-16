"use client";
import type { ReactNode } from "react";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { getNavPageTitle } from "@/config/nav-routes";
import { useTenant } from "@/hooks/useTenant";
import { useSidebar } from "./sidebar-context";
import { ThemeControl } from "./theme-control";
import { MobileNavTrigger, NotificationsButton, FullscreenButton } from "./header-actions";
import { useReportPanelHeaderChrome } from "@/components/find-page/use-report-panel-header-chrome";
import { overlayZClass } from "@/lib/ui/overlay-layers";

/** Slim header atop the floating content panel (Linear-style; two rows when toolbar present). */
export function PanelHeader({
  beforeUtilities,
}: {
  beforeUtilities?: ReactNode;
} = {}) {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const { pageHeader } = useSidebar();
  const leftClusterRef = useRef<HTMLDivElement>(null);
  const rightClusterRef = useRef<HTMLDivElement>(null);
  useReportPanelHeaderChrome(leftClusterRef, rightClusterRef);

  const fallbackTitle = getNavPageTitle(pathname, tenant?.id);
  const hasToolbar = Boolean(pageHeader?.toolbar);
  const hasToolbarSecondary = Boolean(pageHeader?.toolbarSecondary);

  const breadcrumb = pageHeader?.breadcrumb ?? (
    fallbackTitle ? (
      <h1 className="truncate font-serif text-lg text-text-primary">{fallbackTitle}</h1>
    ) : (
      <span className="sr-only">Main</span>
    )
  );

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-chrome)] bg-surface-elevated">
      <div className="flex h-12 items-center justify-between gap-2 px-4">
        <div ref={leftClusterRef} className="flex min-w-0 flex-1 items-center gap-2">
          <MobileNavTrigger />
          <div className="min-w-0 truncate">{breadcrumb}</div>
        </div>
        <div
          ref={rightClusterRef}
          className={`relative ${overlayZClass("dropdown")} flex shrink-0 items-center gap-1.5`}
        >
          {pageHeader?.actions ? (
            <div className="mr-1 flex items-center gap-2">{pageHeader.actions}</div>
          ) : null}
          {beforeUtilities ? (
            <div className="mr-1 flex items-center gap-2">{beforeUtilities}</div>
          ) : null}
          <NotificationsButton />
          <FullscreenButton />
          <ThemeControl />
        </div>
      </div>
      {hasToolbar ? (
        <div className="flex min-h-10 items-center gap-3 border-t border-[color-mix(in_srgb,var(--border-chrome)_60%,transparent)] px-4 py-2">
          {pageHeader!.toolbar}
        </div>
      ) : null}
      {hasToolbarSecondary ? (
        <div className="flex min-h-10 items-center gap-3 border-t border-[color-mix(in_srgb,var(--border-chrome)_60%,transparent)] px-4 py-2">
          {pageHeader!.toolbarSecondary}
        </div>
      ) : null}
    </header>
  );
}
