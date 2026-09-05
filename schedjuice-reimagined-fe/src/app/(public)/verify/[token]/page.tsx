"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCookie } from "cookies-next";
import { BadgeCheck, ShieldXmark } from "iconoir-react";
import Image from "next/image";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { cardRoleLabel } from "@/lib/id-card/build-id-card";
import {
  fetchVerifiedIdentity,
  type VerifiedIdentity,
} from "@/lib/id-card/verify-identity";

type Status = "loading" | "verified" | "invalid";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function VerifyPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [identity, setIdentity] = useState<VerifiedIdentity | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(Boolean(getCookie("access") || getCookie("refresh")));
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchVerifiedIdentity(token).then((result) => {
      if (!active) return;
      if (result.status === "verified") {
        setIdentity(result.identity);
        setStatus("verified");
      } else {
        setStatus("invalid");
      }
    });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm">
        <VerifyBody status={status} identity={identity} isLoggedIn={isLoggedIn} />
      </div>
    </div>
  );
}

type BodyProps = {
  status: Status;
  identity: VerifiedIdentity | null;
  isLoggedIn: boolean;
};

function VerifyBody({ status, identity, isLoggedIn }: BodyProps) {
  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-10" aria-busy>
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary" />
        <p className="text-sm text-text-secondary">Checking this badge…</p>
      </div>
    );
  }

  if (status === "invalid" || !identity) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-surface p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldXmark className="size-6" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-text-primary">Couldn&apos;t verify this badge</h1>
        <p className="text-sm text-text-secondary">This link is invalid or no longer active.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-surface p-8 text-center shadow-sm">
      {identity.id_photo_url ? (
        <Image
          src={identity.id_photo_url}
          alt={identity.name}
          width={96}
          height={96}
          unoptimized
          className="size-24 rounded-full object-cover ring-2 ring-border"
        />
      ) : (
        <div className="flex size-24 items-center justify-center rounded-full bg-surface-hover text-2xl font-semibold text-text-secondary">
          {initials(identity.name)}
        </div>
      )}

      <div className="flex flex-col items-center gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{identity.name}</h1>
        <p className="text-sm text-text-secondary">{cardRoleLabel(identity.roles)}</p>
        <p className="text-xs text-text-secondary">{identity.org_name}</p>
      </div>

      <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-primary">
        <BadgeCheck className="size-4" aria-hidden />
        <span className="text-xs font-medium">Verified</span>
      </div>

      {isLoggedIn ? (
        <Link
          href={`/users/${identity.user_id}`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm"  }), "mt-1")}
        >
          View full profile
        </Link>
      ) : null}
    </div>
  );
}
