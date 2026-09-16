"use client";

import type { ReactNode } from "react";
import { IdCardFace } from "@/components/id-card/id-card-face";
import { buildIdCardPreview } from "@/lib/id-card/build-id-card";
import { orgLogoMonogram } from "@/lib/org-logo-monogram";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";

export const ORG_LOGO_PLACEMENT_LABELS = [
  "Sidebar",
  "Login",
  "Quiz",
  "Teacher profile",
  "Payment receipt",
  "ID card",
] as const;

export type OrganizationLogoPlacementsProps = {
  logoUrl: string | null;
  orgName: string;
  compact?: boolean;
};

function LogoOrMonogram({
  logoUrl,
  orgName,
  className,
}: {
  logoUrl: string | null;
  orgName: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={cn("object-contain", className)} />
    );
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground",
        className,
      )}
      aria-hidden
    >
      {orgLogoMonogram(orgName)}
    </span>
  );
}

function PlacementFrame({
  label,
  ariaLabel,
  children,
  caption,
}: {
  label: string;
  ariaLabel: string;
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        aria-label={ariaLabel}
        className="overflow-hidden rounded-lg border border-border/60 bg-background p-3"
      >
        {children}
      </div>
      {caption ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}

export function OrganizationLogoPlacements({
  logoUrl,
  orgName,
  compact = false,
}: OrganizationLogoPlacementsProps) {
  const previewTenant = {
    name: orgName,
    logo: logoUrl,
  } as organizationType;
  const idCardVm = buildIdCardPreview(
    { name: "Sample Student", roles: ["student"] } as never,
    previewTenant,
    "student",
  );
  idCardVm.orgLogoUrl = logoUrl ?? "";

  return (
    <div
      className={cn(
        "grid gap-4",
        compact ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      <PlacementFrame label="Sidebar" ariaLabel="Preview: sidebar navigation">
        <div className="flex items-center gap-2">
          <LogoOrMonogram
            logoUrl={logoUrl}
            orgName={orgName}
            className="size-9 shrink-0 rounded-md p-0.5"
          />
          <p className="truncate font-serif text-sm text-foreground">{orgName}</p>
        </div>
      </PlacementFrame>

      <PlacementFrame label="Login" ariaLabel="Preview: login screen">
        <div className="flex flex-col items-center gap-2 py-2">
          {logoUrl ? (
            <LogoOrMonogram
              logoUrl={logoUrl}
              orgName={orgName}
              className="max-h-16 max-w-[140px]"
            />
          ) : (
            <p className="text-sm font-semibold">{orgName}</p>
          )}
          <p className="text-xs text-muted-foreground">Login to your account</p>
        </div>
      </PlacementFrame>

      <PlacementFrame label="Quiz" ariaLabel="Preview: quiz header">
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          {logoUrl ? (
            <LogoOrMonogram
              logoUrl={logoUrl}
              orgName={orgName}
              className="h-9 max-w-[120px] shrink-0"
            />
          ) : null}
          <span className="truncate text-sm font-semibold">{orgName}</span>
        </div>
      </PlacementFrame>

      <PlacementFrame label="Teacher profile" ariaLabel="Preview: public teacher profile">
        <div className="flex items-center gap-3 border-b border-border/60 pb-2">
          <LogoOrMonogram
            logoUrl={logoUrl}
            orgName={orgName}
            className="size-9 shrink-0 rounded-md"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{orgName}</p>
            <p className="truncate text-xs text-muted-foreground">Teacher profile</p>
          </div>
        </div>
      </PlacementFrame>

      <PlacementFrame label="Payment receipt" ariaLabel="Preview: payment receipt header">
        <div className="space-y-1 bg-white p-2 text-gray-900">
          {logoUrl ? (
            <LogoOrMonogram logoUrl={logoUrl} orgName={orgName} className="h-10 w-20" />
          ) : null}
          <p className="text-sm font-bold">{orgName}</p>
          <p className="text-base font-bold">Payment Receipt</p>
        </div>
      </PlacementFrame>

      <PlacementFrame
        label="ID card"
        ariaLabel="Preview: ID card header"
        caption="Uses school logo unless you set a separate ID card logo."
      >
        <div className="flex justify-center bg-muted/40 p-2">
          <IdCardFace vm={idCardVm} qrDataUrl="" width={compact ? 140 : 180} />
        </div>
      </PlacementFrame>
    </div>
  );
}
