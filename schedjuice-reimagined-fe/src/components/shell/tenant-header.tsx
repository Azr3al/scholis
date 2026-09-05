"use client";
import { orgLogoMonogram } from "@/lib/org-logo-monogram";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-context";

export function TenantHeader() {
  const { tenant } = useTenant();
  const { open, isMobile, recordMode } = useSidebar();
  const expanded = isMobile ? true : open && !recordMode;
  return (
    <div className="flex h-16 items-center gap-2 px-3">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md",
          !tenant?.logo &&
            "bg-accent text-sm font-semibold text-accent-foreground",
        )}
        aria-hidden={Boolean(tenant?.logo)}
      >
        {tenant?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo}
            alt=""
            className="size-full object-contain p-0.5"
          />
        ) : (
          orgLogoMonogram(tenant?.name)
        )}
      </div>
      {expanded ? (
        <p className="truncate font-serif text-lg text-text-primary">{tenant?.name}</p>
      ) : null}
    </div>
  );
}
