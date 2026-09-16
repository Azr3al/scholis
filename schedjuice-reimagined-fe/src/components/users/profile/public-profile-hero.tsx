import { cn } from "@/lib/utils";
import type { PublicTenantBranding } from "@/types/user-certification";
import { profileInitials } from "./public-profile-utils";

export function PublicProfileHero({
  name,
  roleLabel,
  profileImageUrl,
  tenant,
  compact = false,
}: {
  name: string;
  roleLabel: string;
  profileImageUrl: string | null;
  tenant: PublicTenantBranding | null;
  compact?: boolean;
}) {
  const coverSrc =
    (typeof tenant?.default_cover_image === "string" && tenant.default_cover_image) ||
    "/images/default-cover.jpg";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm">
      <div className={cn("relative", compact ? "h-24 sm:h-28" : "h-36 sm:h-44")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- cover URL varies by tenant */}
        <img src={coverSrc} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-card/90 via-card/20 to-transparent" />
      </div>

      <div className="relative px-4 pb-6 sm:px-6">
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 sm:left-8 sm:translate-x-0",
          )}
        >
          <div
            className={cn(
              "relative overflow-hidden rounded-full bg-muted ring-4 ring-card shadow-md",
              compact ? "size-20 sm:size-24" : "size-28 sm:size-32",
              !profileImageUrl &&
                "flex items-center justify-center bg-primary/10 text-3xl font-semibold text-primary",
            )}
          >
            {profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL
              <img src={profileImageUrl} alt="" className="size-full object-cover" />
            ) : (
              profileInitials(name)
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col items-center gap-3 text-center sm:items-start sm:pl-[9.5rem] sm:text-left",
            compact ? "pt-12 sm:pt-3" : "pt-16 sm:min-h-[5.5rem] sm:pt-4",
          )}
        >
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1
              className={cn(
                "text-balance font-semibold tracking-tight text-text-primary",
                compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl",
              )}
            >
              {name}
            </h1>
            <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary border border-border/60 font-normal">
              {roleLabel}
            </span>
          </div>
          {tenant?.name ? (
            <p className="text-sm text-text-muted">{tenant.name}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
