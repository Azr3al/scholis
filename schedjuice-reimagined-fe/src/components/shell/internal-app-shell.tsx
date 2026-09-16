"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "iconoir-react";

import { InternalTenantPicker } from "@/components/internal/internal-tenant-picker";
import { FullscreenProvider } from "@/components/layout/fullscreen-provider";
import { buttonVariants } from "@/components/primitives";
import { PaperGrain } from "@/components/primitives/decoration/paper-grain";
import { TooltipProvider } from "@/components/primitives/tooltip";
import { shouldShowInternalTenantPicker } from "@/lib/internal-route-access";
import { emergencyFixedClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";

import { ContextRailSlot } from "./context-rail-slot";
import { InternalSidebarNav } from "./internal-sidebar-nav";
import { PanelHeader } from "./panel-header";
import { SidebarProvider, useSidebar } from "./sidebar-context";

function InternalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { contextRail, railRevision } = useSidebar();
  const showTenantPicker = shouldShowInternalTenantPicker(pathname);
  return (
    <div className="sj-root fixed inset-0 flex w-full overflow-clip bg-surface-sunken text-text-primary">
      <a
        href="#main-content"
        className={cn(
          emergencyFixedClassName,
          "left-3 top-3 -translate-y-24 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary shadow-md transition focus:translate-y-0",
        )}
      >
        Skip to main content
      </a>

      <aside className="relative hidden h-full w-64 shrink-0 flex-col bg-surface-sunken md:flex">
        <PaperGrain />
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <div className="flex h-16 items-center px-4">
            <p className="truncate font-serif text-lg text-text-primary">
              Schedjuice Internal
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            <Suspense fallback={null}>
              <InternalSidebarNav />
            </Suspense>
          </div>
          <div className="border-t border-border p-3">
            <Link
              href="/home"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "w-full justify-start",
              )}
            >
              <LogOut width={16} height={16} aria-hidden />
              Exit
            </Link>
          </div>
        </div>
      </aside>

      {contextRail ? (
        <div className="relative z-10 hidden h-full min-w-52 shrink-0 md:flex">
          <ContextRailSlot config={contextRail} revision={railRevision} />
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
        <div className="mb-2 flex flex-col gap-2 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-serif text-base text-text-primary">
              Schedjuice Internal
            </p>
            <Link
              href="/home"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Exit
            </Link>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-elevated">
            <Suspense fallback={null}>
              <InternalSidebarNav />
            </Suspense>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-chrome)] bg-surface-elevated shadow-[var(--shadow-elevated)]">
          <PanelHeader
            beforeUtilities={
              showTenantPicker ? (
                <InternalTenantPicker variant="header" />
              ) : null
            }
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="sj-content-reset sj-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-surface-elevated outline-none focus-visible:outline-none [overflow-anchor:none] scrollbar-gutter-stable"
          >
            <div className="flex min-h-full flex-1 flex-col">
              <Suspense>{children}</Suspense>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function InternalAppShell({ children }: { children: React.ReactNode }) {
  return (
    <FullscreenProvider>
      <TooltipProvider>
        <SidebarProvider>
          <InternalShell>{children}</InternalShell>
        </SidebarProvider>
      </TooltipProvider>
    </FullscreenProvider>
  );
}
