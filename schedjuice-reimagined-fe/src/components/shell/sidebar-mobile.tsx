"use client";
import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sheet } from "@/components/primitives/sheet";
import { WorkspacesTrigger } from "@/components/workspaces/workspaces-trigger";
import { TenantHeader } from "./tenant-header";
import { SidebarNav } from "./sidebar-nav";
import { AccountMenu } from "./account-menu";
import { useSidebar } from "./sidebar-context";

/** Mobile off-canvas nav drawer (Sheet). Closes on route change + link tap. */
export function SidebarMobile() {
  const { openMobile, setOpenMobile, isMobile } = useSidebar();
  const pathname = usePathname();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  if (!isMobile) return null;

  return (
    <Sheet.Root open={openMobile} onOpenChange={setOpenMobile}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="left" className="w-72 gap-0 p-0">
          <Sheet.Title className="sr-only">Navigation</Sheet.Title>
          <TenantHeader />
          <WorkspacesTrigger />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={null}>
              <SidebarNav onNavigate={() => setOpenMobile(false)} />
            </Suspense>
          </div>
          <AccountMenu />
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
