"use client";
import Link from "next/link";
import { Bell, Expand, Collapse, Menu as MenuIcon } from "iconoir-react";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useUtilityNotifications } from "@/hooks/useUtilityNotifications";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

const iconBtn =
  "relative inline-flex size-9 items-center justify-center rounded-md text-text-secondary " +
  "transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-text-primary " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

export function MobileNavTrigger() {
  const { toggle } = useSidebar();
  return (
    <button type="button" onClick={toggle} aria-label="Open navigation" className={cn(iconBtn, "md:hidden")}>
      <MenuIcon width={18} height={18} aria-hidden />
    </button>
  );
}

export function NotificationsButton() {
  const { unreadCount } = useUtilityNotifications();
  const hasUnread = unreadCount > 0;
  return (
    <Link
      href="/notifications"
      aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
      className={iconBtn}
    >
      <Bell width={18} height={18} aria-hidden />
      {hasUnread ? (
        <span className="absolute right-2 top-2 size-2 rounded-full bg-accent" aria-hidden />
      ) : null}
    </Link>
  );
}

export function FullscreenButton() {
  const { toggle, effectiveFullscreen, isFullscreenAvailable, label } = useFullscreen();
  if (!isFullscreenAvailable) return null;
  const Icon = effectiveFullscreen ? Collapse : Expand;
  return (
    <button
      type="button"
      onClick={toggle}
      className={iconBtn}
      aria-label={effectiveFullscreen ? `Exit ${label}` : `Enter ${label}`}
    >
      <Icon width={18} height={18} aria-hidden />
    </button>
  );
}
