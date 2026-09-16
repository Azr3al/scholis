# ID Cards — Plan 5: Public `/verify/[token]` Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public smart-link target for the badge QR: a no-auth `/verify/[token]` page that shows a minimal "verified identity" card (photo, name, role, org, verified check) and offers a "View full profile" link only when the scanner is logged in.

**Architecture:** Client page under the `(public)` route group; `verify` added to the middleware matcher exclusion so it stays unauthenticated. It fetches the Plan 1 public endpoint (`GET /api/v1/public/id-verify/<token>`) with a raw `fetch` (tenant resolved by the backend from the request Origin, mirroring `watch/[token]`). Role label reuses `cardRoleLabel` (Plan 2) — no duplicated mapping. Repo: `schedjuice-reimagined-fe`.

**Tech Stack:** Next.js App Router, `cookies-next`, `cardRoleLabel` (Plan 2), Tailwind tokens. Conventions: `next-link-no-raw-anchor`, `prefer-link-over-router-push`, `plain-language-ui`, `concise-ui-copy`, `no-chained-ternary`.

**Spec:** `docs/superpowers/specs/2026-06-21-id-cards-design.md` (§3 QR smart verify, §6 `/verify/[token]`, §9 invalid/expired state).
**Depends on:** Plan 1 (public endpoint), Plan 2 (`cardRoleLabel`).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/middleware.ts` | Add `verify` to the matcher exclusion |
| `src/lib/id-card/verify-identity.ts` (NEW) | `fetchVerifiedIdentity(token)` + `VerifiedIdentity` type |
| `src/app/(public)/verify/[token]/page.tsx` (NEW) | Public verify page |

**Run dev to verify:** `npm run dev` → open `/verify/<token>` (mint a token via the backend or copy one from a generated badge QR).

---

## Task 1: Allow `/verify` through middleware

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add `verify` to the matcher exclusion**

In `src/middleware.ts`, the `config.matcher` negative-lookahead lists public path prefixes (`...|watch|teachers|attachments|...`). Add `verify`:

```typescript
export const config = {
  matcher: [
    "/((?!api|_next/|favicon.ico|login|svgs|images|unauthorized|notfound|terms|privacy|public|reset-password|forgot-password|join-course|register|watch|teachers|verify|attachments|\\.well-known).*)",
  ],
};
```

(Only `verify` is added; keep every existing entry.)

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(id-card): allow /verify through middleware"
```

---

## Task 2: `fetchVerifiedIdentity` client helper

**Files:**
- Create: `src/lib/id-card/verify-identity.ts`

- [ ] **Step 1: Implement**

```typescript
export type VerifiedIdentity = {
  verified: true;
  user_id: number;
  name: string;
  roles: string[];
  id_photo_url: string | null;
  org_name: string;
  public_profile_slug: string | null;
};

export type VerifyResult =
  | { status: "verified"; identity: VerifiedIdentity }
  | { status: "invalid" };

/**
 * Calls the public verify endpoint. Tenant is resolved server-side from the
 * request Origin (same approach as the public `watch` page), so no auth or
 * tenant header is needed.
 */
export async function fetchVerifiedIdentity(token: string): Promise<VerifyResult> {
  const apiBase = (process.env.NEXT_PUBLIC_BASE_API_URL || "/api/v1").replace(/\/$/, "");
  try {
    const res = await fetch(`${apiBase}/public/id-verify/${token}`);
    if (!res.ok) return { status: "invalid" };
    const json = await res.json();
    const identity = json?.data as VerifiedIdentity | undefined;
    if (!identity?.verified) return { status: "invalid" };
    return { status: "verified", identity };
  } catch {
    return { status: "invalid" };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/id-card/verify-identity.ts
git commit -m "feat(id-card): add verify-identity fetch helper"
```

---

## Task 3: `/verify/[token]` page

**Files:**
- Create: `src/app/(public)/verify/[token]/page.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCookie } from "cookies-next";
import { BadgeCheck, ShieldX } from "lucide-react";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
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
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <VerifyBody
          status={status}
          identity={identity}
          isLoggedIn={isLoggedIn}
        />
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
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        <p className="text-sm text-muted-foreground">Checking this badge…</p>
      </div>
    );
  }

  if (status === "invalid" || !identity) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldX className="size-6" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Couldn&apos;t verify this badge</h1>
        <p className="text-sm text-muted-foreground">This link is invalid or no longer active.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
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
        <div className="flex size-24 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
          {initials(identity.name)}
        </div>
      )}

      <div className="flex flex-col items-center gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{identity.name}</h1>
        <p className="text-sm text-muted-foreground">{cardRoleLabel(identity.roles)}</p>
        <p className="text-xs text-muted-foreground">{identity.org_name}</p>
      </div>

      <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-primary">
        <BadgeCheck className="size-4" aria-hidden />
        <span className="text-xs font-medium">Verified</span>
      </div>

      {isLoggedIn ? (
        <Link
          href={`/users/${identity.user_id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")}
        >
          View full profile
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`. Mint a token (e.g. open `/id-card`, inspect the QR's URL, or call the backend) and open `/verify/<token>`.
Expected:
- valid token → photo/monogram, name, role, org, "Verified" pill; "View full profile" appears only when an `access`/`refresh` cookie is present.
- garbage token → "Couldn't verify this badge".
- while loading → spinner.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/verify/[token]/page.tsx"
git commit -m "feat(id-card): add public /verify/[token] page"
```

---

## Self-Review

- **Spec §3 / §6 smart verify:** public page resolves the token via the Plan 1 endpoint and shows minimal identity. ✅
- **Spec §6 logged-in deep link:** "View full profile" → `/users/<user_id>` shown only when an auth cookie exists. ✅
- **Spec §9 invalid state:** explicit "Couldn't verify this badge" + loading spinner. ✅
- **Middleware:** `verify` added to the matcher exclusion so the page is reachable unauthenticated. ✅
- **DRY:** role label uses shared `cardRoleLabel` (Plan 2); no duplicated role mapping. ✅
- **Envelope consistency:** reads `json.data` (matches Plan 1 `self.ok(data=...)` → `{ isError, message, data }`). ✅
- **Conventions:** `next/link` + `buttonVariants` (no raw anchor / no `Button asChild`), plain-language copy, single-level conditional renders. ✅
- **Placeholder scan:** full code in every step. ✅
