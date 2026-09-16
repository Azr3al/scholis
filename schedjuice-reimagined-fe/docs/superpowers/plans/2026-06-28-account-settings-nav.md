# Account Nav, Inline Settings & Image Flicker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** Follow workspace `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" step as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Remove the shell account popover, inline account settings into the user record rail, reskin settings to DESIGN.md primitives, and stop avatar flicker on tab focus.

**Architecture:** Extend `RecordSectionId` with `settings` (own-profile only); replace `AccountMenu` Menu with a profile Link; build `RecordSettings` with `?pane=appearance|password` sub-panes mirroring Academic; fix flicker via global `refetchOnWindowFocus: false`, presigned URL merge helper, and Avatar hardening.

**Tech Stack:** Next.js App Router, React 19, Base UI primitives, Iconoir, `nuqs`, TanStack Query v4, `motion/react`.

**Spec:** `docs/superpowers/specs/2026-06-28-account-settings-nav-design.md`

---

## File structure

| Action | Path | Responsibility |
| --- | --- | --- |
| Create | `src/lib/user/profile-image-url.ts` | Normalize presigned URLs; merge account without URL swap |
| Create | `src/lib/user/profile-image-url.test.ts` | Unit tests for normalize + merge |
| Modify | `src/lib/query.ts` | Global `refetchOnWindowFocus: false` |
| Modify | `src/components/primitives/avatar.tsx` | Stable-src rendering |
| Modify | `src/components/record/record-sections.ts` | Add `settings` section |
| Modify | `src/components/record/record-section-rail.tsx` | Account group + logout footer |
| Modify | `src/components/shell/account-menu.tsx` | Menu → Link (rename optional) |
| Create | `src/components/record/settings/settings-panes.ts` | Pane IDs + labels |
| Create | `src/components/record/settings/use-settings-pane.ts` | `nuqs` pane state |
| Create | `src/components/record/settings/settings-pane-switcher.tsx` | Tabs sub-nav |
| Create | `src/components/record/settings/appearance-pane.tsx` | Theme, sounds, view mode |
| Create | `src/components/record/settings/password-pane.tsx` | Reset email |
| Create | `src/components/record/sections/record-settings.tsx` | Section shell + mobile logout |
| Modify | `src/app/(internal)/users/[id]/page.tsx` | Wire settings; merge image; query opts |
| Replace | `src/app/(internal)/users/[id]/settings/page.tsx` | Redirect |
| Modify | `src/components/calendar/calendar-timezone-notice.tsx` | New settings URL |
| Modify | `src/content/changelog/entries.ts` | Changelog href |
| Delete | `src/components/settings/appearance-card.tsx` | Ported |
| Delete | `src/components/settings/change-password-card.tsx` | Ported |
| Delete | `src/components/settings/settings-sidebar.tsx` | Ported |

---

## Task 1: Profile image URL stability

**Files:**
- Create: `src/lib/user/profile-image-url.ts`
- Create: `src/lib/user/profile-image-url.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/lib/user/profile-image-url.test.ts
import { describe, expect, it } from "vitest";
import {
  mergeAccountPreservingProfileImage,
  normalizeProfileImagePath,
} from "./profile-image-url";
import type { accountType } from "@/types/user";

const base = { id: 1, name: "Test", roles: [] } as accountType;

describe("normalizeProfileImagePath", () => {
  it("returns null for empty", () => {
    expect(normalizeProfileImagePath(null)).toBeNull();
    expect(normalizeProfileImagePath("")).toBeNull();
  });

  it("strips query params from absolute URLs", () => {
    const a = "https://cdn.example.com/u/1.jpg?X-Amz-Signature=aaa&X-Amz-Expires=3600";
    const b = "https://cdn.example.com/u/1.jpg?X-Amz-Signature=bbb&X-Amz-Expires=3600";
    expect(normalizeProfileImagePath(a)).toBe(normalizeProfileImagePath(b));
  });

  it("preserves path-only URLs", () => {
    expect(normalizeProfileImagePath("/images/default.jpg")).toBe("/images/default.jpg");
  });
});

describe("mergeAccountPreservingProfileImage", () => {
  it("keeps previous profile_image when path unchanged", () => {
    const prev = {
      ...base,
      profile_image: "https://x/u/1.jpg?sig=old",
    };
    const next = {
      ...base,
      profile_image: "https://x/u/1.jpg?sig=new",
      email: "new@example.com",
    };
    const merged = mergeAccountPreservingProfileImage(prev, next);
    expect(merged.profile_image).toBe(prev.profile_image);
    expect(merged.email).toBe("new@example.com");
  });

  it("uses next image when path changed", () => {
    const prev = { ...base, profile_image: "https://x/a.jpg?q=1" };
    const next = { ...base, profile_image: "https://x/b.jpg?q=2" };
    expect(mergeAccountPreservingProfileImage(prev, next).profile_image).toBe(next.profile_image);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm exec vitest run src/lib/user/profile-image-url.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

```ts
// src/lib/user/profile-image-url.ts
import type { accountType } from "@/types/user";

export function normalizeProfileImagePath(
  url: string | null | undefined,
): string | null {
  if (!url || !url.trim()) return null;
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    /* fall through */
  }
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function mergeAccountPreservingProfileImage(
  prev: accountType | undefined,
  next: accountType,
): accountType {
  if (!prev?.profile_image || !next.profile_image) return next;
  const prevPath = normalizeProfileImagePath(prev.profile_image);
  const nextPath = normalizeProfileImagePath(next.profile_image);
  if (prevPath && nextPath && prevPath === nextPath) {
    return { ...next, profile_image: prev.profile_image };
  }
  return next;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec vitest run src/lib/user/profile-image-url.test.ts`
Expected: PASS

- [ ] **Step 5: Stage**

```bash
git add src/lib/user/profile-image-url.ts src/lib/user/profile-image-url.test.ts
```

---

## Task 2: Query defaults & user query options

**Files:**
- Modify: `src/lib/query.ts`
- Modify: `src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: Disable global focus refetch**

In `src/lib/query.ts`, inside `defaultOptions.queries`:

```ts
refetchOnWindowFocus: false,
```

- [ ] **Step 2: Harden user record query**

In `users/[id]/page.tsx`, on the main `useQuery` for `getUser${id}`:

```ts
staleTime: 5 * 60 * 1000,
refetchOnWindowFocus: false,
```

- [ ] **Step 3: Merge profile image on user state update**

Import `mergeAccountPreservingProfileImage` and change the effect that sets `user` from query data:

```ts
useEffect(() => {
  if (isSuccess && data?.data?.data) {
    setUser((prev) =>
      mergeAccountPreservingProfileImage(prev ?? undefined, data.data.data),
    );
  } else if (userQueryIsError) {
    setUser(null);
  }
}, [isSuccess, data, userQueryIsError]);
```

- [ ] **Step 4: Stage**

```bash
git add src/lib/query.ts src/app/(internal)/users/[id]/page.tsx
```

---

## Task 3: Avatar primitive hardening

**Files:**
- Modify: `src/components/primitives/avatar.tsx`

- [ ] **Step 1: Import normalize helper and track loaded path**

Add at top of `Avatar` component body:

```tsx
import { normalizeProfileImagePath } from "@/lib/user/profile-image-url";
import { useRef } from "react";

// inside Avatar():
const loadedPathRef = useRef<string | null>(null);
const displaySrc = (() => {
  if (!src) return null;
  const nextPath = normalizeProfileImagePath(src);
  if (
    loadedPathRef.current &&
    nextPath &&
    loadedPathRef.current === nextPath
  ) {
    // src string may differ (presigned rotation) — keep showing until onLoad confirms
  }
  return src;
})();
```

Use `displaySrc` on `BaseAvatar.Image`. On image load:

```tsx
<BaseAvatar.Image
  src={displaySrc ?? undefined}
  className="size-full object-cover"
  onLoad={() => {
    loadedPathRef.current = normalizeProfileImagePath(src);
  }}
/>
```

- [ ] **Step 2: Adjust fallback delay**

```tsx
<BaseAvatar.Fallback delay={src ? 400 : 0} ...>
```

Keep as-is for first load; the merge helper prevents unnecessary src churn.

- [ ] **Step 3: Stage**

```bash
git add src/components/primitives/avatar.tsx
```

---

## Task 4: Record sections & rail (settings + logout)

**Files:**
- Modify: `src/components/record/record-sections.ts`
- Modify: `src/components/record/record-section-rail.tsx`

- [ ] **Step 1: Add settings to section registry**

In `record-sections.ts`:

```ts
export type RecordSectionId =
  | "overview"
  | "academic"
  | "finance"
  | "records"
  | "points"
  | "ai"
  | "settings";

// in RECORD_SECTIONS array, after ai:
{
  id: "settings",
  label: "Settings",
  visible: ({ subject, viewer }) => subject.id === viewer.id,
},
```

- [ ] **Step 2: Extend record rail layout**

In `record-section-rail.tsx`:

1. Import `LogOut` from `iconoir-react`, `AlertDialog`, `Button`, `logout` from auth, `useState`.
2. Split `sections` into main sections (exclude `settings`) and settings section.
3. Wrap nav in `flex flex-col flex-1 min-h-0`.
4. After main section buttons, render Account group when `settings` section is in `visibleSections` result:

```tsx
const allSections = subject && viewer ? visibleSections({ tenant, subject, viewer }) : ...;
const mainSections = allSections.filter((s) => s.id !== "settings");
const settingsSection = allSections.find((s) => s.id === "settings");
const isOwnProfile = Boolean(subject && viewer && subject.id === viewer.id);
```

5. Account group:

```tsx
{settingsSection ? (
  <div className="mt-2">
    <p className="mb-1.5 px-2.5 text-xs font-medium uppercase tracking-wide text-text-muted">
      Account
    </p>
    <div className="flex flex-col gap-0.5 pl-3">
      <OrgSectionButton-style button for settings ... onSelect("settings") />
    </div>
  </div>
) : null}
```

6. Footer with flex-1 spacer + logout (only `isOwnProfile`):

```tsx
{isOwnProfile ? (
  <>
    <div className="flex-1" />
    <div className="border-t border-border px-2 py-2">
      <button type="button" onClick={() => setConfirmOpen(true)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-danger hover:bg-surface-hover ...">
        <LogOut width={16} height={16} aria-hidden />
        Log out
      </button>
    </div>
    <AlertDialog ... same as current account-menu ... />
  </>
) : null}
```

Reuse the exact `AlertDialog` markup from `account-menu.tsx`.

- [ ] **Step 3: Stage**

```bash
git add src/components/record/record-sections.ts src/components/record/record-section-rail.tsx
```

---

## Task 5: Shell account footer → profile link

**Files:**
- Modify: `src/components/shell/account-menu.tsx`

- [ ] **Step 1: Replace Menu with Link**

Remove `Menu`, `NavArrowUp`, `AlertDialog`, logout imports/state.

```tsx
import Link from "next/link";
// keep Avatar, useUser, useSidebar, cn

export function AccountMenu() {
  const { user } = useUser();
  const { open, isMobile, recordMode } = useSidebar();
  const expanded = isMobile ? true : open && !recordMode;

  if (!user?.id) return null;

  return (
    <div className="border-t border-[var(--border-chrome)] p-2">
      <Link
        href={`/users/${user.id}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md p-2 text-left outline-none",
          "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
          !expanded && "justify-center",
        )}
      >
        <Avatar src={user?.profile_image} name={user?.name ?? "?"} className="size-8" />
        {expanded ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-primary">{user?.name}</span>
            <span className="block truncate text-xs text-text-muted">{user?.roles?.join(" · ")}</span>
          </span>
        ) : null}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Stage**

```bash
git add src/components/shell/account-menu.tsx
```

---

## Task 6: Settings pane infrastructure

**Files:**
- Create: `src/components/record/settings/settings-panes.ts`
- Create: `src/components/record/settings/use-settings-pane.ts`
- Create: `src/components/record/settings/settings-pane-switcher.tsx`

- [ ] **Step 1: Pane registry** (mirror `academic-panes.ts`)

```ts
export type SettingsPaneId = "appearance" | "password";

export const SETTINGS_PANES: { id: SettingsPaneId; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "password", label: "Password" },
];

export const DEFAULT_SETTINGS_PANE: SettingsPaneId = "appearance";

const VALID = new Set<string>(SETTINGS_PANES.map((p) => p.id));

export function isSettingsPaneId(value: string): value is SettingsPaneId {
  return VALID.has(value);
}
```

- [ ] **Step 2: Hook** (mirror `use-academic-pane.ts`)

```ts
"use client";
import { useCallback } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { DEFAULT_SETTINGS_PANE, isSettingsPaneId, type SettingsPaneId } from "./settings-panes";

export function useSettingsPane() {
  const [raw, setRaw] = useQueryState(
    "pane",
    parseAsString.withDefault(DEFAULT_SETTINGS_PANE),
  );
  const pane: SettingsPaneId = isSettingsPaneId(raw) ? raw : DEFAULT_SETTINGS_PANE;
  const setPane = useCallback(
    (next: SettingsPaneId) => {
      void setRaw(next);
    },
    [setRaw],
  );
  return { pane, setPane };
}
```

- [ ] **Step 3: Switcher** (copy `academic-pane-switcher.tsx`, swap imports)

- [ ] **Step 4: Stage**

```bash
git add src/components/record/settings/
```

---

## Task 7: Appearance pane (DESIGN.md)

**Files:**
- Create: `src/components/record/settings/appearance-pane.tsx`

- [ ] **Step 1: Build pane**

Port logic from `appearance-card.tsx` but use:

- `RecordSection` for each block (Theme, Sound, Default view mode)
- `ThemeToggle` from `@/components/primitives/theme-toggle` + `useUnifiedTheme`
- `Switch` / `Slider` from `@/components/primitives/*`
- `Button` from `@/components/primitives/button`
- `Select` primitive for view mode OR two text buttons
- `useMutation` + `updateEntity` for `default_view_mode`; `setUser` with `mergeAccountPreservingProfileImage` on success
- `useQuery` for user entity with `refetchOnWindowFocus: false`

Remove all `@/components/ui/card` imports.

- [ ] **Step 2: Stage**

```bash
git add src/components/record/settings/appearance-pane.tsx
```

---

## Task 8: Password pane

**Files:**
- Create: `src/components/record/settings/password-pane.tsx`

- [ ] **Step 1: Build pane**

Port from `change-password-card.tsx`:

```tsx
"use client";
import { makePostRequest } from "@/app/client-api/utils";
import { RecordSection } from "@/components/record/record-section";
import { Button } from "@/components/primitives/button";
import { useToast } from "@/components/ui/use-toast";
import { useUser } from "@/hooks/useUser";
import { useMutation } from "@tanstack/react-query";

export function PasswordPane() {
  const { user } = useUser();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => makePostRequest("password-reset/request", { email: user?.email }),
    onSuccess: () => toast({ description: "A link to reset your password has been sent to your email." }),
    onError: () => toast({ variant: "destructive", description: "Something went wrong." }),
  });

  return (
    <RecordSection
      title="Change password"
      description="We'll email you a link to choose a new password."
    >
      <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
        Send reset email
      </Button>
    </RecordSection>
  );
}
```

- [ ] **Step 2: Stage**

```bash
git add src/components/record/settings/password-pane.tsx
```

---

## Task 9: RecordSettings section + wire profile page

**Files:**
- Create: `src/components/record/sections/record-settings.tsx`
- Modify: `src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: RecordSettings component**

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import { crossfade } from "@/lib/sj/motion";
import { SettingsPaneSwitcher } from "@/components/record/settings/settings-pane-switcher";
import { useSettingsPane } from "@/components/record/settings/use-settings-pane";
import { AppearancePane } from "@/components/record/settings/appearance-pane";
import { PasswordPane } from "@/components/record/settings/password-pane";
// Mobile logout: AlertDialog + Button danger at bottom, md:hidden

export function RecordSettings({ userId }: { userId: string }) {
  const { pane, setPane } = useSettingsPane();
  return (
    <div className="sj-root flex flex-col gap-8">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl text-text-primary">Settings</h2>
        <p className="text-sm text-text-muted">Manage your account preferences.</p>
      </header>
      <SettingsPaneSwitcher pane={pane} onPaneChange={setPane} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={pane} variants={crossfade} initial="initial" animate="animate" exit="exit">
          {pane === "appearance" ? <AppearancePane userId={userId} /> : <PasswordPane />}
        </motion.div>
      </AnimatePresence>
      {/* MobileLogoutFooter — confirm dialog, visible md:hidden */}
    </div>
  );
}
```

- [ ] **Step 2: Wire into page**

In `users/[id]/page.tsx`:

1. Import `RecordSettings`, `useSettingsPane` (optional for guard).
2. Guard: if `section === "settings" && account?.id !== Number(id)`, `router.replace` to `?section=overview`.
3. When entering settings from another section, ensure default pane — call `setSection("settings")` already sets section; if invalid pane, `useSettingsPane` defaults to appearance.
4. Add render branch:

```tsx
{section === "settings" && user && account && account.id === Number(id) && (
  <RecordSettings userId={id} />
)}
```

5. Hide profile stats / completion banner when `section === "settings"` (optional polish — keeps settings page quiet).

- [ ] **Step 3: Stage**

```bash
git add src/components/record/sections/record-settings.tsx src/app/(internal)/users/[id]/page.tsx
```

---

## Task 10: Legacy redirect & inbound links

**Files:**
- Replace: `src/app/(internal)/users/[id]/settings/page.tsx`
- Modify: `src/components/calendar/calendar-timezone-notice.tsx`
- Modify: `src/content/changelog/entries.ts`

- [ ] **Step 1: Redirect page**

```tsx
import { redirect } from "next/navigation";

export default function UserSettingsRedirect({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pane =
    "change-password" in searchParams
      ? "password"
      : "appearance" in searchParams
        ? "appearance"
        : "appearance";
  redirect(`/users/${params.id}?section=settings&pane=${pane}`);
}
```

- [ ] **Step 2: Update calendar notice link**

```tsx
href={`/users/${user.id}?section=settings&pane=appearance`}
```

- [ ] **Step 3: Update changelog entry**

Change appearance settings href to `/users/1?section=settings&pane=appearance`.

- [ ] **Step 4: Grep for stragglers**

Run: `rg '/users/\$\{.*\}/settings|/users/[0-9]+/settings' schedjuice-reimagined-fe/src`
Fix any remaining hrefs.

- [ ] **Step 5: Stage**

```bash
git add src/app/(internal)/users/[id]/settings/page.tsx src/components/calendar/calendar-timezone-notice.tsx src/content/changelog/entries.ts
```

---

## Task 11: Remove legacy settings components

**Files:**
- Delete: `src/components/settings/appearance-card.tsx`
- Delete: `src/components/settings/change-password-card.tsx`
- Delete: `src/components/settings/settings-sidebar.tsx`

- [ ] **Step 1: Verify no imports remain**

Run: `rg 'appearance-card|change-password-card|settings-sidebar' schedjuice-reimagined-fe/src`
Expected: no matches

- [ ] **Step 2: Delete files**

- [ ] **Step 3: Stage**

```bash
git add -u src/components/settings/
```

---

## Task 12: Verification

- [ ] **Step 1: Typecheck**

Run: `cd schedjuice-reimagined-fe && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Unit tests**

Run: `pnpm exec vitest run src/lib/user/profile-image-url.test.ts`
Expected: PASS

- [ ] **Step 3: Manual smoke**

1. Click shell avatar → lands on `/users/{id}` (no popover).
2. Own profile rail → Account / Settings / Log out visible.
3. Settings → Appearance + Password tabs work; theme toggle persists.
4. Visit `/users/{id}/settings` → redirects.
5. Switch browser tab away and back → avatars do not flash.

---

## Plan self-review (spec coverage)

| Spec § | Task |
| --- | --- |
| §4.1 Shell footer Link | Task 5 |
| §4.2 Record rail settings + logout | Task 4 |
| §4.3 Legacy redirect | Task 10 |
| §4.4 Inbound links | Task 10 |
| §5 Settings content | Tasks 6–9 |
| §6 Image flicker | Tasks 1–3 |
| §7 Mobile logout | Task 9 |
| §7 Guard other-user settings | Task 9 |
| §8 Acceptance | Task 12 |

No placeholders remain. Types: `SettingsPaneId`, `RecordSectionId` extended consistently.
