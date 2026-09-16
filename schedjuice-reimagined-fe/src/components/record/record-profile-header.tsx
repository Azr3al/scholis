"use client";

import type { CSSProperties } from "react";
import { useMemo, useRef } from "react";
import Image from "next/image";
import { Avatar } from "@/components/primitives/avatar";
import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import { useMainContentScroll } from "@/hooks/use-main-content-scroll";
import {
  resolveCoverSrc,
  resolveProfileSrc,
} from "@/components/record/record-profile-media";
import { normalizeProfileImagePath } from "@/lib/user/profile-image-url";
import { isStaffSubject } from "@/lib/points/visibility";
import { TeachingSubjectChips } from "@/components/users/teaching-subjects/teaching-subject-chips";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

function useStableMediaSrc(src: string) {
  const loadedPathRef = useRef<string | null>(null);
  const loadedSrcRef = useRef<string | null>(null);

  const displaySrc = useMemo(() => {
    const nextPath = normalizeProfileImagePath(src);
    if (
      loadedPathRef.current &&
      nextPath &&
      loadedPathRef.current === nextPath &&
      loadedSrcRef.current
    ) {
      return loadedSrcRef.current;
    }
    return src;
  }, [src]);

  const onLoad = () => {
    loadedPathRef.current = normalizeProfileImagePath(src);
    loadedSrcRef.current = src;
  };

  return { displaySrc, onLoad };
}

export function RecordProfileHeader({
  subject,
  viewer,
  tenant,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
}) {
  const showTeachingSubjectChips = isStaffSubject(subject);
  const { coverRef } = useMainContentScroll();
  const coverSrc = resolveCoverSrc(subject, tenant);
  const profileSrc = resolveProfileSrc(subject);
  const { displaySrc: displayCoverSrc, onLoad: onCoverLoad } =
    useStableMediaSrc(coverSrc);

  return (
    <div className="sj-root -mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
      <div
        ref={coverRef}
        className="relative w-full shrink-0 overflow-hidden bg-surface-sunken [overflow-anchor:none]"
        style={
          {
            "--cover-height": "280px",
            "--cover-opacity": 1,
            height: "var(--cover-height)",
            opacity: "var(--cover-opacity)",
          } as CSSProperties
        }
      >
        <Image
          unoptimized
          src={displayCoverSrc}
          alt="Cover image"
          fill
          priority={false}
          className="object-cover object-center"
          sizes="100vw"
          onLoad={onCoverLoad}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-45% via-surface-elevated/20 via-70% to-surface-elevated"
          aria-hidden
        />
      </div>

      <div className="relative px-4 pb-5 pt-14 sm:px-6 sm:pb-6 sm:pt-5">
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 sm:left-8 sm:translate-x-0">
          <Avatar
            src={profileSrc}
            name={subject.name ?? "?"}
            className="size-24 ring-4 ring-surface-elevated sm:size-28"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:min-h-[4.5rem] sm:pl-[8.75rem]">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-balance font-serif text-2xl text-text-primary sm:text-3xl">
                {subject.name}
              </h1>
              {subject.resigned_at ? (
                <span className="shrink-0 rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-medium text-danger">
                  Resigned
                </span>
              ) : subject.is_active === false ? (
                <span className="shrink-0 rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-medium text-danger">
                  Disabled
                </span>
              ) : null}
            </div>
            <p
              className="max-w-full truncate text-sm text-text-muted"
              title={subject.email || undefined}
            >
              {maskEmailLocalPart(subject.email)}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {(subject.roles ?? []).map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-accent"
                >
                  {r}
                </span>
              ))}
            </div>
            {showTeachingSubjectChips ? (
              <TeachingSubjectChips userId={subject.id} enabled />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
