"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  internalNavLinks,
  isInternalNavItemActive,
} from "@/config/internal-nav-routes";
import { Tooltip } from "@/components/primitives/tooltip";
import { playClick } from "@/lib/sound/click-sound";
import { cn } from "@/lib/utils";

export function InternalSidebarNav({
  expanded = true,
  onNavigate,
}: {
  expanded?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2" aria-label="Internal tools">
      {internalNavLinks.map((item) => {
        const Icon = item.icon;
        const active = isInternalNavItemActive(pathname, item.href);

        if (!expanded) {
          return (
            <Tooltip.Root key={item.href}>
              <Tooltip.Trigger
                render={
                  <Link
                    href={item.href}
                    aria-label={item.title}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      playClick();
                      onNavigate?.();
                    }}
                    className={cn(
                      "flex items-center justify-center rounded-md p-2.5 transition-colors duration-[var(--duration-fast)]",
                      active
                        ? "bg-surface-active text-text-primary"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                    )}
                  />
                }
              >
                <Icon width={18} height={18} aria-hidden />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="right">
                  <Tooltip.Popup>{item.title}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              playClick();
              onNavigate?.();
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
              active
                ? "bg-surface-active font-medium text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <Icon width={16} height={16} className="shrink-0" aria-hidden />
            <span className="truncate">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
