"use client";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/primitives/tooltip";
import { FullscreenProvider } from "@/components/layout/fullscreen-provider";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { ViewAsBanner } from "@/components/layout/view-as-banner";
import { DvrPendingBanner } from "@/components/layout/dvr-pending-banner";
import { WebPushRegistrar } from "@/components/web-push/web-push-registrar";
import ChatArea from "@/components/course/chat/chat-area";
import { useUser } from "@/hooks/useUser";
import { shouldShowChatBubble } from "@/lib/chat/show-chat-bubble";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { SidebarRail } from "./sidebar-rail";
import { SidebarMobile } from "./sidebar-mobile";
import { cn } from "@/lib/utils";
import { emergencyFixedClassName } from "@/lib/ui/overlay-classnames";
import { FindPageProvider } from "@/components/find-page/find-page-provider";
import { WorkspacesProvider } from "@/components/workspaces/workspaces-provider";
import { GlobalOverlayProvider } from "@/lib/ui/global-overlay-registry";
import { useFindPage } from "@/components/find-page/use-find-page";
import { PanelHeader } from "./panel-header";
import { ContextRailSlot } from "./context-rail-slot";

function Shell({ children }: { children: React.ReactNode }) {
  const { effectiveFullscreen } = useFullscreen();
  const { contextRail, railRevision } = useSidebar();
  const { panelRef } = useFindPage();
  const pathname = usePathname();
  const { user } = useUser();
  const showChatBubble = shouldShowChatBubble(pathname, user?.id);
  return (
    <div className="sj-root fixed inset-0 flex w-full overflow-clip bg-surface-sunken text-text-primary">
      <a
        href="#main-content"
        className={cn(emergencyFixedClassName, "left-3 top-3 -translate-y-24 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-text-primary shadow-md transition focus:translate-y-0")}
      >
        Skip to main content
      </a>

      {!effectiveFullscreen ? <SidebarRail /> : null}
      {!effectiveFullscreen && contextRail ? (
        <div className="relative z-10 hidden h-full min-w-52 shrink-0 md:flex">
          <ContextRailSlot config={contextRail} revision={railRevision} />
        </div>
      ) : null}
      <SidebarMobile />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
        <div className="sj-content-reset empty:hidden">
          <ViewAsBanner />
          <DvrPendingBanner />
        </div>
        <div
          ref={panelRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-chrome)] bg-surface-elevated shadow-[var(--shadow-elevated)]"
        >
          {!effectiveFullscreen ? <PanelHeader /> : null}
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              "sj-content-reset flex min-h-0 flex-1 flex-col bg-surface-elevated outline-none focus-visible:outline-none",
              effectiveFullscreen
                ? "overflow-hidden"
                : "sj-scroll overflow-y-auto overflow-x-hidden [overflow-anchor:none] scrollbar-gutter-stable",
            )}
          >
            <div className="flex min-h-full flex-1 flex-col">
              <Suspense>{children}</Suspense>
            </div>
          </main>
        </div>
      </div>

      {!effectiveFullscreen && showChatBubble ? (
        <div className="sj-content-reset">
          <ChatArea />
        </div>
      ) : null}
      <WebPushRegistrar />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FullscreenProvider>
      <TooltipProvider>
        <SidebarProvider>
          <GlobalOverlayProvider>
            <FindPageProvider>
              <WorkspacesProvider>
                <Shell>{children}</Shell>
              </WorkspacesProvider>
            </FindPageProvider>
          </GlobalOverlayProvider>
        </SidebarProvider>
      </TooltipProvider>
    </FullscreenProvider>
  );
}
