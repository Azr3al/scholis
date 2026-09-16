"use client";

import { Skeleton } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type PublicTenantBrandingLike = {
  name?: string;
  logo?: string | null;
  tagline?: string;
};

type PublicTenantShellProps = {
  tenant: PublicTenantBrandingLike | null;
  children: React.ReactNode;
  isBrandingLoading?: boolean;
  /** Shown when tenant name is unavailable. */
  fallbackName?: string;
  className?: string;
};

export function PublicTenantShell({
  tenant,
  children,
  isBrandingLoading = false,
  fallbackName = "Consultation booking",
  className,
}: PublicTenantShellProps) {
  return (
    <div className={cn("min-h-screen bg-surface", className)}>
      <header className="border-b border-border/60 bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          {isBrandingLoading ? (
            <div
              className="flex items-center gap-3"
              aria-busy="true"
              aria-label="Loading organization"
            >
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <Skeleton className="h-5 w-32 max-w-[12rem] rounded-md" />
            </div>
          ) : (
            <>
              {tenant?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- tenant logo URL varies
                <img
                  src={tenant.logo}
                  alt=""
                  className="size-9 rounded-md object-contain"
                />
              ) : (
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary"
                  aria-hidden
                >
                  {(tenant?.name ?? fallbackName).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {tenant?.name ?? fallbackName}
                </p>
                {tenant?.tagline ? (
                  <p className="truncate text-xs text-text-muted">{tenant.tagline}</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
