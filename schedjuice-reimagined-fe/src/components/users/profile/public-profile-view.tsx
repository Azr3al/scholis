"use client";
import { Skeleton } from "@/components/primitives";

import type { PublicProfile, PublicProfileStatus, PublicTenantBranding } from "@/types/user-certification";
import { useCallback, useEffect, useState } from "react";
import { PublicProfileCertifications } from "./public-profile-certifications";
import { PublicProfileHero } from "./public-profile-hero";
import { PublicProfileQualifications } from "./public-profile-qualifications";
import { PublicProfileShell } from "./public-profile-shell";

function LoadingState() {
  return (
    <PublicProfileShell tenant={null}>
      <div aria-busy="true" className="space-y-6">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm">
          <Skeleton className="h-36 w-full rounded-none sm:h-44" />
          <div className="px-4 pb-6 pt-16 sm:px-6">
            <Skeleton className="mx-auto size-28 rounded-full sm:mx-0" />
            <Skeleton className="mx-auto mt-6 h-8 w-48 sm:mx-0" />
            <Skeleton className="mx-auto mt-2 h-4 w-24 sm:mx-0" />
          </div>
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </PublicProfileShell>
  );
}

function StatusMessage({
  tenant,
  title,
  description,
}: {
  tenant: PublicTenantBranding | null;
  title: string;
  description: string;
}) {
  return (
    <PublicProfileShell tenant={tenant}>
      <div className="rounded-lg border border-border bg-surface text-text-primary border-border/60 shadow-sm">
        <div className="flex flex-col gap-1.5 p-6 text-center">
          <h3 className="font-serif text-xl leading-none tracking-tight">{title}</h3>
          <p className="text-sm text-text-secondary">{description}</p>
        </div>
      </div>
    </PublicProfileShell>
  );
}

export interface PublicProfileViewProps {
  slug: string;
}

export function PublicProfileView({ slug }: PublicProfileViewProps) {
  const [status, setStatus] = useState<PublicProfileStatus>("loading");
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tenant, setTenant] = useState<PublicTenantBranding | null>(null);

  const loadProfile = useCallback(async () => {
    if (!slug) return;

    setStatus("loading");
    try {
      const apiBase = (process.env.NEXT_PUBLIC_BASE_API_URL || "/api/v1").replace(/\/$/, "");

      const [profileRes, tenantRes] = await Promise.all([
        fetch(`${apiBase}/public/people/${slug}`, { cache: "no-store" }),
        fetch(`${apiBase}/organizations/public`, { cache: "no-store" }),
      ]);

      if (tenantRes.ok) {
        const tenantJson = await tenantRes.json();
        setTenant((tenantJson.data ?? null) as PublicTenantBranding | null);
      } else {
        setTenant(null);
      }

      const profileJson = await profileRes.json();
      if (!profileRes.ok) {
        setProfile(null);
        setStatus(profileRes.status === 404 ? "not_found" : "error");
        return;
      }

      setProfile(profileJson.data as PublicProfile);
      setStatus("ready");
    } catch {
      setProfile(null);
      setStatus("error");
    }
  }, [slug]);

  useEffect(() => {
    if (!profile?.name) return;
    const school = tenant?.name;
    document.title = school ? `${profile.name} · ${school}` : profile.name;
  }, [profile?.name, tenant?.name]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void loadProfile();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [loadProfile]);

  if (status === "loading") return <LoadingState />;

  if (status === "not_found") {
    return (
      <StatusMessage
        tenant={tenant}
        title="Profile not found"
        description="This profile is unavailable or has not been made public."
      />
    );
  }

  if (status === "error" || !profile) {
    return (
      <StatusMessage
        tenant={tenant}
        title="Something went wrong"
        description="We could not load this profile. Please try again later."
      />
    );
  }

  const certifications = profile.certifications ?? [];

  return (
    <PublicProfileShell tenant={tenant}>
      <PublicProfileHero
        name={profile.name}
        roleLabel={profile.role_label}
        profileImageUrl={profile.profile_image_url}
        tenant={tenant}
      />
      <PublicProfileQualifications qualifications={profile.qualifications} />
      {certifications.length > 0 ? (
        <PublicProfileCertifications certifications={certifications} />
      ) : null}
    </PublicProfileShell>
  );
}
