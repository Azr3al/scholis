"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { NavArrowRight } from "iconoir-react";
import {
  navLinks,
  resolveNavItemHref,
  resolveSectionNavHref,
  navSectionContainsActivePath,
  isNavItemActive,
} from "@/config/nav-routes";
import { visibleChildren } from "@/components/nav/nav-visibility";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { usePermissions } from "@/hooks/usePermissions";
import { Tooltip } from "@/components/primitives/tooltip";
import { playClick } from "@/lib/sound/click-sound";
import { navIcon } from "./nav-icons";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useUser();
  const { tenant } = useTenant();
  const { canAny } = usePermissions();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open, isMobile, setOpen, recordMode, contextRail } = useSidebar();
  const expanded = isMobile ? true : open && !recordMode;

  if (!user || !tenant) return null;

  const sections = navLinks
    .map((route) => ({ route, children: visibleChildren(route, { canAny }, tenant, user) }))
    .filter(({ children }) => children.length > 0);

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2">
      {sections.map(({ route, children }) => {
        const Icon = navIcon(route.title);
        const active = navSectionContainsActivePath(
          route,
          pathname,
          tenant?.id,
          searchParams,
        );

        // Collapsed rail: navigate in record mode, otherwise expand.
        if (!expanded) {
          const sectionHref = (() => {
            if (!recordMode || !contextRail) return null;
            if (active) return contextRail.parent.href;
            return resolveSectionNavHref(route, { canAny }, tenant, user);
          })();

          if (sectionHref) {
            const tooltipLabel = active ? contextRail!.parent.label : route.title;
            return (
              <Tooltip.Root key={route.title}>
                <Tooltip.Trigger
                  render={
                    <Link
                      href={sectionHref}
                      aria-label={active ? `${contextRail!.parent.label} list` : route.title}
                      onClick={() => playClick()}
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
                    <Tooltip.Popup>{tooltipLabel}</Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          }

          return (
            <Tooltip.Root key={route.title}>
              <Tooltip.Trigger
                render={
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={route.title}
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
                  <Tooltip.Popup>{route.title}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        }

        return (
          <NavSection key={route.title} title={route.title} Icon={Icon}>
            {children.map((item) => {
              const href = resolveNavItemHref(item, tenant);
              const itemActive = isNavItemActive(
                item.href,
                pathname,
                searchParams,
                tenant?.id,
                item.activeOnSubpaths ?? true,
              );
              return (
                <Link
                  key={item.title}
                  href={href}
                  aria-current={itemActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md py-1.5 pl-9 pr-2.5 text-sm transition-colors duration-[var(--duration-fast)]",
                    itemActive
                      ? "bg-surface-active font-medium text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </NavSection>
        );
      })}
    </nav>
  );
}

function NavSection({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}) {
  const [sectionOpen, setSectionOpen] = useState(true);
  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        aria-expanded={sectionOpen}
        className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-text-primary"
      >
        <Icon width={16} height={16} className="shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{title}</span>
        <NavArrowRight
          width={14}
          height={14}
          aria-hidden
          className={cn("shrink-0 text-text-muted transition-transform", sectionOpen && "rotate-90")}
        />
      </button>
      {sectionOpen ? <div className="mt-0.5 flex flex-col gap-0.5">{children}</div> : null}
    </div>
  );
}
