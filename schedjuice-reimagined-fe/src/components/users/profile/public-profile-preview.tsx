"use client";

import type { PublicCertification, PublicTenantBranding } from "@/types/user-certification";
import { PublicProfileCertifications } from "./public-profile-certifications";
import { PublicProfileHero } from "./public-profile-hero";
import { PublicProfileQualifications } from "./public-profile-qualifications";
import { PublicProfileShell } from "./public-profile-shell";

export type PublicProfilePreviewProps = {
  name: string;
  roleLabel: string;
  profileImageUrl: string | null;
  qualifications: Record<string, unknown> | null | undefined;
  showCertifications: boolean;
  certifications: PublicCertification[];
  enabled: boolean;
  tenant: PublicTenantBranding | null;
};

export function PublicProfilePreview({
  name,
  roleLabel,
  profileImageUrl,
  qualifications,
  showCertifications,
  certifications,
  enabled,
  tenant,
}: PublicProfilePreviewProps) {
  const visibleCerts = showCertifications ? certifications : [];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60">
      <div className="border-b border-border/60 bg-muted/50 px-3 py-2 text-xs font-medium text-text-muted">
        Preview — this is how your public profile will look
      </div>
      <div className={enabled ? "" : "opacity-50"}>
        <PublicProfileShell tenant={tenant} compact>
          <PublicProfileHero
            name={name}
            roleLabel={roleLabel}
            profileImageUrl={profileImageUrl}
            tenant={tenant}
            compact
          />
          <PublicProfileQualifications qualifications={qualifications} />
          {showCertifications ? (
            <PublicProfileCertifications certifications={visibleCerts} />
          ) : null}
        </PublicProfileShell>
      </div>
      {!enabled ? (
        <p className="border-t border-border/60 bg-muted/30 px-3 py-2 text-center text-xs text-text-muted">
          Enable public profile to publish this page.
        </p>
      ) : null}
    </div>
  );
}
