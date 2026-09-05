"use client";
import { Suspense } from "react";
import { PaperGrain } from "@/components/primitives/decoration/paper-grain";
import { WorkspacesTrigger } from "@/components/workspaces/workspaces-trigger";
import { TenantHeader } from "./tenant-header";
import { SidebarNav } from "./sidebar-nav";
import { AccountMenu } from "./account-menu";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

/** Desktop recessed rail (Linear-style): flat cream surface, paper grain, collapsible. */
export function SidebarRail() {
  const { open, recordMode } = useSidebar();
  const expanded = open && !recordMode;
  return (
    <aside
      data-state={expanded ? "expanded" : "collapsed"}
      className={cn(
        "sj-root relative hidden h-full shrink-0 flex-col bg-surface-sunken md:flex",
        "transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        expanded ? "w-64" : "w-[4rem]",
      )}
    >
      <PaperGrain />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <TenantHeader />
        <WorkspacesTrigger />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          <Suspense fallback={null}>
            <SidebarNav />
          </Suspense>
        </div>
        <AccountMenu />
      </div>
    </aside>
  );
}
