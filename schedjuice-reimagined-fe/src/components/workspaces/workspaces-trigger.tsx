"use client";

import { ViewGrid } from "iconoir-react";
import { Tooltip } from "@/components/primitives/tooltip";
import { useSidebar } from "@/components/shell/sidebar-context";
import { cn } from "@/lib/utils";
import { useWorkspaces } from "./use-workspaces";

export function WorkspacesTrigger() {
  const { workspaces, setOpen } = useWorkspaces();
  const { open, isMobile, recordMode, setOpenMobile } = useSidebar();
  const expanded = isMobile ? true : open && !recordMode;

  if (workspaces.length === 0) return null;

  const openWorkspaces = () => {
    if (isMobile) setOpenMobile(false);
    const show = () => setOpen(true);
    if (isMobile) {
      requestAnimationFrame(show);
      return;
    }
    show();
  };

  if (!expanded) {
    return (
      <div className="px-2 pb-1">
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <button
                type="button"
                aria-label="Workspaces"
                onClick={openWorkspaces}
                className={cn(
                  "flex w-full items-center justify-center rounded-md p-2.5",
                  "text-text-secondary transition-colors duration-[var(--duration-fast)]",
                  "hover:bg-surface-hover hover:text-text-primary",
                )}
              />
            }
          >
            <ViewGrid width={18} height={18} aria-hidden />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="right">
              <Tooltip.Popup>Workspaces</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    );
  }

  return (
    <div className="px-2 pb-1">
      <button
        type="button"
        aria-label="Workspaces"
        onClick={openWorkspaces}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
          "text-text-secondary transition-colors duration-[var(--duration-fast)]",
          "hover:bg-surface-hover hover:text-text-primary",
        )}
      >
        <ViewGrid width={16} height={16} className="shrink-0" aria-hidden />
        <span className="truncate text-left">Workspaces</span>
      </button>
    </div>
  );
}
