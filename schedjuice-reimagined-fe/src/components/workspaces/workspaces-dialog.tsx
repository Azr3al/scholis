"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/primitives/dialog";
import { useNavigationGuard } from "@/components/shell/use-navigation-guard";
import { cn } from "@/lib/utils";
import { WorkspaceLogo } from "./workspace-logo";
import { useWorkspaces } from "./use-workspaces";

export function WorkspacesDialog() {
  const { open, setOpen, workspaces } = useWorkspaces();
  const router = useRouter();
  const { confirmNavigation } = useNavigationGuard();
  const enterable = useMemo(
    () => workspaces.filter((w) => w.status === "enterable" && w.homeHref),
    [workspaces],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) setSelectedIndex(0);
  }, [open]);

  const go = (href: string) => {
    if (!confirmNavigation(href)) return;
    router.push(href);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-2xl sm:max-w-2xl gap-5">
          <Dialog.Title>Workspaces</Dialog.Title>
          <Dialog.Description className="sr-only">
            Open a workspace
          </Dialog.Description>
          <div
            key={open ? "open" : "closed"}
            tabIndex={0}
            autoFocus
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                setSelectedIndex((i) =>
                  enterable.length === 0
                    ? 0
                    : Math.min(i + 1, enterable.length - 1),
                );
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && enterable[selectedIndex]?.homeHref) {
                e.preventDefault();
                go(enterable[selectedIndex].homeHref);
              }
            }}
          >
            {workspaces.map((ws) => {
              const comingSoon = ws.status === "coming_soon";
              const enterableIndex = enterable.findIndex((w) => w.id === ws.id);
              const selected =
                !comingSoon && enterableIndex === selectedIndex;
              const body = (
                <>
                  <WorkspaceLogo
                    name={ws.logo}
                    size={56}
                    aria-hidden
                    className={comingSoon ? "pointer-events-none" : undefined}
                  />
                  <span className="w-full truncate text-sm text-text-primary">
                    {ws.label}
                  </span>
                  {comingSoon ? (
                    <span className="text-xs text-text-muted">Coming soon</span>
                  ) : null}
                </>
              );
              const cardClass = cn(
                "sj-workspace-tile flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center",
                "transition-colors duration-[var(--duration-fast)]",
                comingSoon
                  ? "cursor-default opacity-50"
                  : "hover:bg-surface-hover",
                selected && "ring-2 ring-[var(--ring)]",
              );
              if (comingSoon) {
                return (
                  <div
                    key={ws.id}
                    className={cardClass}
                    aria-disabled="true"
                  >
                    {body}
                  </div>
                );
              }
              return (
                <Link
                  key={ws.id}
                  href={ws.homeHref!}
                  aria-label={ws.label}
                  onClick={(e) => {
                    e.preventDefault();
                    go(ws.homeHref!);
                  }}
                  className={cardClass}
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
