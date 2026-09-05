import type { PublicTenantBranding } from "@/types/user-certification";

export function PublicProfileShell({
  tenant,
  children,
  compact = false,
}: {
  tenant: PublicTenantBranding | null;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "bg-surface" : "min-h-screen bg-linear-to-b from-muted/40 via-background to-background"}>
      {!compact ? (
        <header className="border-b border-border/60 bg-surface/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
            {tenant?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- tenant logo URL varies
              <img src={tenant.logo} alt="" className="size-9 rounded-md object-contain" />
            ) : (
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden
              >
                {(tenant?.name ?? "S").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">
                {tenant?.name ?? "Staff profile"}
              </p>
              {tenant?.tagline ? (
                <p className="truncate text-xs text-text-muted">{tenant.tagline}</p>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      <main className={compact ? "p-0" : "mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10"}>
        {children}
      </main>
    </div>
  );
}
