"use client";
import Link from "next/link";
import { Avatar } from "@/components/primitives/avatar";
import { useUser } from "@/hooks/useUser";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

export function AccountMenu() {
  const { user } = useUser();
  const { open, isMobile, recordMode } = useSidebar();
  const expanded = isMobile ? true : open && !recordMode;

  if (!user?.id) return null;

  return (
    <div className="border-t border-[var(--border-chrome)] p-2">
      <Link
        href={`/users/${user.id}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md p-2 text-left outline-none",
          "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
          !expanded && "justify-center",
        )}
      >
        <Avatar src={user?.profile_image} name={user?.name ?? "?"} className="size-8" />
        {expanded ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-primary">{user?.name}</span>
            <span className="block truncate text-xs text-text-muted">{user?.roles?.join(" · ")}</span>
          </span>
        ) : null}
      </Link>
    </div>
  );
}
