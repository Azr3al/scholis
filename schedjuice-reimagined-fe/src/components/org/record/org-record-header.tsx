"use client";

import Image from "next/image";
import { Avatar } from "@/components/primitives/avatar";
import type { organizationType } from "@/types/organization";

function resolveOrgCoverSrc(org: organizationType): string {
  const cover = org.default_cover_image;
  if (typeof cover === "string" && cover.length > 0) return cover;
  return "/images/default-cover.jpg";
}

export function OrgRecordHeader({ org }: { org: organizationType }) {
  const coverSrc = resolveOrgCoverSrc(org);

  return (
    <div className="sj-root -mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
      <div className="relative h-[200px] w-full shrink-0 overflow-hidden bg-surface-sunken sm:h-[240px]">
        <Image
          unoptimized
          src={coverSrc}
          alt=""
          fill
          priority={false}
          className="object-cover object-center"
          sizes="100vw"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-45% via-surface-elevated/20 via-70% to-surface-elevated"
          aria-hidden
        />
      </div>

      <div className="relative -mt-12 flex flex-col gap-3 px-4 pb-2 sm:-mt-14 sm:px-6 lg:px-8">
        <Avatar
          src={org.logo ?? undefined}
          name={org.name ?? "?"}
          className="size-20 rounded-lg border-4 border-surface sm:size-24"
        />
        <div className="space-y-1 pb-2">
          <h1 className="font-serif text-2xl text-text-primary sm:text-3xl">
            {org.name}
          </h1>
          {org.tagline ? (
            <p className="text-sm text-text-secondary">{org.tagline}</p>
          ) : null}
          {org.domain_url ? (
            <a
              href={`https://${org.domain_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline"
            >
              {org.domain_url}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
