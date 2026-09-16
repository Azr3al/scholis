# Organization Record Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Repo commit policy:** Follow workspace `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" step as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Replace fragmented org profile/edit/AI/theme pages with a unified org record shell — context rail, grouped sections, Overview dashboard, per-section save — on `/organizations/profile` (tenant) and `/organizations/[id]` (platform), then delete all legacy routes.

**Architecture:** Shared `OrgRecordShell` registers `OrgSectionRail` via `useContextRail`. Section state lives in `?section=` + `?pane=` (`useOrgSection`, nuqs). Org schema sections reuse extracted `fieldConfig` + `ORGANIZATION_PROFILE_EDIT_SECTIONS` keys with per-section PATCH. AI/branding/platform sections port existing page bodies into panel chrome. Legacy route files deleted in final stage; inbound links updated in same PR.

**Tech Stack:** Next.js 15 App Router, React 19, nuqs, TanStack Query v4, react-hook-form + AutoForm (legacy fields — reskin deferred), motion/react + `src/lib/sj/motion.ts`, Iconoir, Vitest.

**Spec:** [`docs/superpowers/specs/2026-06-28-org-record-settings-design.md`](../specs/2026-06-28-org-record-settings-design.md)

---

## File structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `src/config/org-record-sections.ts` | Section IDs, groups, labels, `visible()` gates |
| `src/config/org-record-sections.test.ts` | Visibility + ID validation tests |
| `src/lib/org/org-section-href.ts` | Build `?section=` / `?pane=` hrefs for tenant vs platform |
| `src/lib/org/build-org-section-payload.ts` | Pick section keys + build FormData for PATCH |
| `src/lib/org/build-org-section-payload.test.ts` | Payload key subset tests |
| `src/lib/org/org-ai-visibility.ts` | Org-level AI section / usage visibility |
| `src/components/org/record/use-org-section.ts` | nuqs `section` + `pane` |
| `src/components/org/record/org-section-rail.tsx` | Desktop context rail with group headers |
| `src/components/org/record/org-mobile-sections.tsx` | Mobile horizontal chips |
| `src/components/org/record/org-record-header.tsx` | Cover + logo + name strip |
| `src/components/org/record/org-record-shell.tsx` | Shell: rail, header, section router |
| `src/components/org/record/use-org-record-page-header.ts` | Breadcrumb registration |
| `src/components/org/record/sections/org-overview.tsx` | Read-only dashboard |
| `src/components/org/record/sections/org-section-panel.tsx` | Title + description + children chrome |
| `src/components/org/record/sections/org-schema-section.tsx` | Per-section form + save |
| `src/components/org/record/sections/use-org-edit-form.ts` | Shared form instance + org query |
| `src/components/org/record/sections/org-field-config.tsx` | Extracted from `profile/edit/page.tsx` |
| `src/components/org/record/sections/org-profile-section.tsx` | Profile + logo + cover |
| `src/components/org/record/sections/org-branding-section.tsx` | Theme colors |
| `src/components/org/record/sections/org-ai-section.tsx` | AI panes wrapper |
| `src/components/org/record/sections/org-ai-settings-pane.tsx` | Port ai-settings form |
| `src/components/org/record/sections/org-ai-usage-pane.tsx` | Port ai-usage overview |
| `src/components/org/record/sections/org-ai-failures-pane.tsx` | Port failures table |
| `src/components/org/record/sections/org-billing-section.tsx` | Port `[id]/billing` |
| `src/components/org/record/sections/org-admins-section.tsx` | Admin list |
| `src/components/org/ai/ai-usage-tabs.tsx` | Moved + retargeted hrefs |
| `src/components/org/ai/usage-trend-bars.tsx` | Moved from app route |
| `src/components/org/ai/failures-table.tsx` | Moved from app route |

**Modify:**

| Path | Change |
| --- | --- |
| `src/app/(internal)/organizations/profile/page.tsx` | Render `<OrgRecordShell mode="tenant" />` |
| `src/app/(internal)/organizations/[id]/page.tsx` | Render `<OrgRecordShell mode="platform" orgId={id} />` |
| `src/app/(internal)/organizations/profile/edit/organization-profile-sections.ts` | Add `branding` section comment; export `getSectionKeys(id)` helper |
| `src/config/nav-routes.tsx` | AI Usage + Billing hrefs |
| `src/config/route-permissions.ts` | Remove deleted path rules |
| `src/config/__tests__/route-permissions.test.ts` | Update AI usage path tests |
| `src/lib/org-route-access.ts` | Remove ai-settings/ai-usage tenant exclusions (obsolete) |
| `src/lib/__tests__/org-route-access.test.ts` | Update |
| `src/components/course/overveiw/course-header.tsx` | Org settings links |
| `src/components/course/course-zoom-meeting-edit-section.tsx` | Org settings links |
| `src/app/(internal)/id-card/page.tsx` | Link to `?section=id-cards` |
| `src/app/(internal)/id-card/settings/page.tsx` | Replace route → `?section=id-cards` |
| `src/content/changelog/entries.ts` | Update href |
| `src/components/users/ai/ai-usage-panel.tsx` | Import path for `UsageTrendBars` |

**Delete (final stage only):**

- `src/app/(internal)/organizations/profile/edit/page.tsx`
- `src/app/(internal)/organizations/profile/theme/page.tsx`
- `src/app/(internal)/organizations/ai-settings/page.tsx`
- `src/app/(internal)/organizations/ai-usage/page.tsx`
- `src/app/(internal)/organizations/ai-usage/failures/page.tsx`
- `src/app/(internal)/organizations/ai-usage/_components/*` (after move)
- `src/app/(internal)/organizations/[id]/edit/page.tsx`
- `src/app/(internal)/organizations/[id]/ai-usage/page.tsx`
- `src/app/(internal)/organizations/[id]/ai-usage/failures/page.tsx`
- `src/app/(internal)/organizations/[id]/billing/page.tsx`

**Keep:** `src/app/(internal)/organizations/[id]/admins/create/page.tsx` (sub-route)

---

# Stage A — Section registry + hooks + rail (shippable skeleton)

## Task 1: Org section config + tests

**Files:**
- Create: `src/config/org-record-sections.ts`
- Create: `src/config/org-record-sections.test.ts`

- [ ] **Step 1: Write failing visibility tests**

```typescript
// src/config/org-record-sections.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORG_SECTION,
  isOrgSectionId,
  visibleOrgSections,
  type OrgRecordContext,
} from "./org-record-sections";

const baseCtx = (overrides: Partial<OrgRecordContext> = {}): OrgRecordContext => ({
  mode: "tenant",
  viewer: { id: 1, roles: ["admin"] } as OrgRecordContext["viewer"],
  ...overrides,
});

describe("isOrgSectionId", () => {
  it("accepts known sections", () => {
    expect(isOrgSectionId("overview")).toBe(true);
    expect(isOrgSectionId("microsoft")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isOrgSectionId("nope")).toBe(false);
  });
});

describe("visibleOrgSections", () => {
  it("hides platform group on tenant mode", () => {
    const ids = visibleOrgSections(baseCtx({ mode: "tenant" })).map((s) => s.id);
    expect(ids).toContain("overview");
    expect(ids).not.toContain("billing");
    expect(ids).not.toContain("admins");
  });
  it("shows platform group on platform mode for manage_all viewer", () => {
    const ctx = baseCtx({
      mode: "platform",
      viewer: {
        id: 1,
        roles: ["superadmin"],
        permissions: ["org.manage_all"],
      } as OrgRecordContext["viewer"],
    });
    const ids = visibleOrgSections(ctx).map((s) => s.id);
    expect(ids).toContain("billing");
    expect(ids).toContain("admins");
  });
});

describe("DEFAULT_ORG_SECTION", () => {
  expect(DEFAULT_ORG_SECTION).toBe("overview");
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm vitest run src/config/org-record-sections.test.ts`

- [ ] **Step 3: Implement registry**

```typescript
// src/config/org-record-sections.ts
import { hasAdminCredentials } from "@/helpers/authorization";
import { canAccessPlatformOrganizations } from "@/helpers/authorization";
import { canViewOrgAiSection } from "@/lib/org/org-ai-visibility";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type OrgSectionId =
  | "overview"
  | "profile"
  | "branding"
  | "id-cards"
  | "access-library"
  | "microsoft"
  | "telegram"
  | "video"
  | "reports-billing"
  | "staff-payroll"
  | "checkin"
  | "region-currency"
  | "ai"
  | "billing"
  | "admins";

export type OrgSectionGroup =
  | "top"
  | "school"
  | "access"
  | "integrations"
  | "operations"
  | "intelligence"
  | "platform";

export type OrgRecordMode = "tenant" | "platform";

export type OrgRecordContext = {
  mode: OrgRecordMode;
  viewer: accountType;
  tenant?: organizationType | null;
};

export type OrgSectionDef = {
  id: OrgSectionId;
  label: string;
  group: OrgSectionGroup;
  visible: (ctx: OrgRecordContext) => boolean;
};

export const DEFAULT_ORG_SECTION: OrgSectionId = "overview";

export const ORG_SECTIONS: OrgSectionDef[] = [
  { id: "overview", label: "Overview", group: "top", visible: () => true },
  { id: "profile", label: "Profile", group: "school", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "branding", label: "Branding", group: "school", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "id-cards", label: "ID cards", group: "school", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "access-library", label: "Access & library", group: "access", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "microsoft", label: "Microsoft Teams", group: "integrations", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "telegram", label: "Telegram", group: "integrations", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "video", label: "Video meetings", group: "integrations", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "reports-billing", label: "Reports & billing", group: "operations", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "staff-payroll", label: "Staff & payroll", group: "operations", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "checkin", label: "Building check-in", group: "operations", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "region-currency", label: "Region & currency", group: "operations", visible: (c) => hasAdminCredentials(c.viewer) },
  { id: "ai", label: "AI", group: "intelligence", visible: (c) => canViewOrgAiSection(c) },
  {
    id: "billing",
    label: "Billing",
    group: "platform",
    visible: (c) =>
      c.mode === "platform" &&
      Boolean(c.tenant && canAccessPlatformOrganizations(c.viewer, c.tenant)),
  },
  {
    id: "admins",
    label: "Admins",
    group: "platform",
    visible: (c) =>
      c.mode === "platform" &&
      Boolean(c.tenant && canAccessPlatformOrganizations(c.viewer, c.tenant)),
  },
];

export const ORG_SECTION_IDS = ORG_SECTIONS.map((s) => s.id);

export function isOrgSectionId(value: string): value is OrgSectionId {
  return (ORG_SECTION_IDS as string[]).includes(value);
}

export function visibleOrgSections(ctx: OrgRecordContext): OrgSectionDef[] {
  return ORG_SECTIONS.filter((s) => s.visible(ctx));
}

export const ORG_GROUP_LABELS: Record<Exclude<OrgSectionGroup, "top">, string> = {
  school: "School",
  access: "Access",
  integrations: "Integrations",
  operations: "Operations",
  intelligence: "Intelligence",
  platform: "Platform",
};
```

- [ ] **Step 4: Add org AI visibility helper**

```typescript
// src/lib/org/org-ai-visibility.ts
import { hasAdminCredentials, permissionsFor } from "@/helpers/authorization";
import type { OrgRecordContext } from "@/config/org-record-sections";

export function canViewOrgAiSection(ctx: OrgRecordContext): boolean {
  if (!hasAdminCredentials(ctx.viewer)) return false;
  const perms = permissionsFor(ctx.viewer);
  return perms.can("org.configure") || perms.can("ai.usage.view");
}

export function canViewOrgAiUsagePane(ctx: OrgRecordContext): boolean {
  return permissionsFor(ctx.viewer).can("ai.usage.view");
}
```

- [ ] **Step 5: Re-run tests — expect PASS**

Run: `pnpm vitest run src/config/org-record-sections.test.ts`

- [ ] **Step 6: Stage only**

```bash
git add src/config/org-record-sections.ts src/config/org-record-sections.test.ts src/lib/org/org-ai-visibility.ts
```

---

## Task 2: Section href builder + payload helper tests

**Files:**
- Create: `src/lib/org/org-section-href.ts`
- Create: `src/lib/org/build-org-section-payload.ts`
- Create: `src/lib/org/build-org-section-payload.test.ts`
- Modify: `src/app/(internal)/organizations/profile/edit/organization-profile-sections.ts`

- [ ] **Step 1: Export `getOrgSchemaSectionKeys` from organization-profile-sections**

Add to `organization-profile-sections.ts`:

```typescript
export function getOrgSchemaSectionKeys(sectionId: string): readonly string[] | undefined {
  const found = ORGANIZATION_PROFILE_EDIT_SECTIONS.find((s) => s.id === sectionId);
  return found?.keys;
}

export function getOrgSchemaSectionMeta(sectionId: string) {
  return ORGANIZATION_PROFILE_EDIT_SECTIONS.find((s) => s.id === sectionId);
}
```

- [ ] **Step 2: Write failing payload test**

```typescript
// src/lib/org/build-org-section-payload.test.ts
import { describe, expect, it } from "vitest";
import { pickOrgSectionValues } from "./build-org-section-payload";

describe("pickOrgSectionValues", () => {
  it("picks only keys for the microsoft section", () => {
    const all = {
      name: "School",
      is_microsoft_on: true,
      app_id: "abc",
      timezone: "Asia/Yangon",
    };
    const picked = pickOrgSectionValues("microsoft", all);
    expect(picked).toEqual({ is_microsoft_on: true, app_id: "abc" });
    expect(picked).not.toHaveProperty("name");
    expect(picked).not.toHaveProperty("timezone");
  });
});
```

- [ ] **Step 3: Implement helpers**

```typescript
// src/lib/org/build-org-section-payload.ts
import { getOrgSchemaSectionKeys } from "@/app/(internal)/organizations/profile/edit/organization-profile-sections";
import {
  applyIdCardBrandingToPayload,
  buildOrganizationOwnerFormData,
} from "@/helpers/organization-profile-submit";

export function pickOrgSectionValues(
  sectionId: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const keys = getOrgSchemaSectionKeys(sectionId);
  if (!keys) return {};
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in values) out[key] = values[key];
  }
  return out;
}

export function buildOrgSectionFormData(
  sectionId: string,
  values: Record<string, unknown>,
  opts?: { idCardLogoCleared?: boolean },
): FormData {
  const payload = pickOrgSectionValues(sectionId, values);
  if (sectionId === "id-cards") {
    applyIdCardBrandingToPayload(payload, {
      logoCleared: opts?.idCardLogoCleared ?? false,
    });
  }
  return buildOrganizationOwnerFormData(payload);
}
```

```typescript
// src/lib/org/org-section-href.ts
import type { OrgRecordMode } from "@/config/org-record-sections";

export type OrgAiPane = "settings" | "usage" | "failures";

export function orgRecordBasePath(mode: OrgRecordMode, orgId: string | number): string {
  return mode === "tenant" ? "/organizations/profile" : `/organizations/${orgId}`;
}

export function orgSectionHref(
  mode: OrgRecordMode,
  orgId: string | number,
  section: string,
  extras?: { pane?: OrgAiPane; date?: string },
): string {
  const params = new URLSearchParams({ section });
  if (extras?.pane) params.set("pane", extras.pane);
  if (extras?.date) params.set("date", extras.date);
  return `${orgRecordBasePath(mode, orgId)}?${params.toString()}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm vitest run src/lib/org/build-org-section-payload.test.ts`

- [ ] **Step 5: Stage only**

---

## Task 3: `useOrgSection` hook

**Files:**
- Create: `src/components/org/record/use-org-section.ts`

- [ ] **Step 1: Implement hook (mirror `use-record-section.ts`)**

```typescript
"use client";

import { useCallback } from "react";
import { parseAsString, useQueryState } from "nuqs";
import {
  DEFAULT_ORG_SECTION,
  isOrgSectionId,
  type OrgSectionId,
} from "@/config/org-record-sections";

export type OrgAiPane = "settings" | "usage" | "failures";

const AI_PANES: OrgAiPane[] = ["settings", "usage", "failures"];

function isOrgAiPane(value: string): value is OrgAiPane {
  return (AI_PANES as string[]).includes(value);
}

export function useOrgSection() {
  const [rawSection, setRawSection] = useQueryState(
    "section",
    parseAsString.withDefault(DEFAULT_ORG_SECTION),
  );
  const [rawPane, setRawPane] = useQueryState(
    "pane",
    parseAsString.withDefault("settings"),
  );

  const section: OrgSectionId = isOrgSectionId(rawSection)
    ? rawSection
    : DEFAULT_ORG_SECTION;
  const pane: OrgAiPane = isOrgAiPane(rawPane) ? rawPane : "settings";

  const setSection = useCallback(
    (s: OrgSectionId) => {
      void setRawSection(s);
    },
    [setRawSection],
  );

  const setPane = useCallback(
    (p: OrgAiPane) => {
      void setRawPane(p);
    },
    [setRawPane],
  );

  return { section, pane, setSection, setPane };
}
```

- [ ] **Step 2: Stage only**

---

## Task 4: Org section rail + mobile sections

**Files:**
- Create: `src/components/org/record/org-section-rail.tsx`
- Create: `src/components/org/record/org-mobile-sections.tsx`

- [ ] **Step 1: Implement `OrgSectionRail`**

Copy structure from `src/components/record/record-section-rail.tsx`. Key differences:

- Props: `{ org, mode, section, onSelect, contextParent, ctx: OrgRecordContext }`
- Back link uses `contextParent.label` / `contextParent.href`
- Identity block: org logo via tenant `logo` or placeholder `Avatar`; name + domain
- Render `visibleOrgSections(ctx)` grouped by `group !== "top"` with `ORG_GROUP_LABELS` headers between groups
- Buttons call `onSelect(s.id)` + `playClick()` when changing section

- [ ] **Step 2: Implement `OrgMobileSections`**

Copy from `record-mobile-sections.tsx`; use `visibleOrgSections(ctx)` and pill styling.

- [ ] **Step 3: Manual smoke — import in a throwaway Story/dev page OR proceed to Task 5**

- [ ] **Step 4: Stage only**

---

# Stage B — Shell + Overview

## Task 5: Org record header

**Files:**
- Create: `src/components/org/record/org-record-header.tsx`

- [ ] **Step 1: Implement header**

Adapt `RecordProfileHeader` but simplified:

- Use org `default_cover_image` or tenant default cover URL pattern from `resolveCoverSrc` equivalent for org (check `useTenant` cover fields)
- Square org logo (not user avatar)
- Fraunces org name, tagline, external domain link
- Static cover — no scroll parallax refs

- [ ] **Step 2: Stage only**

---

## Task 6: Page header hook + shell skeleton

**Files:**
- Create: `src/components/org/record/use-org-record-page-header.ts`
- Create: `src/components/org/record/org-record-shell.tsx`
- Modify: `src/app/(internal)/organizations/profile/page.tsx`
- Modify: `src/app/(internal)/organizations/[id]/page.tsx`

- [ ] **Step 1: Implement breadcrumb hook**

```typescript
// use-org-record-page-header.ts — pattern from use-course-record-page-header.ts
// breadcrumb: Link parent + Fraunces org name
// tenant label prefix: "School settings"
// platform label prefix: "Organizations"
```

- [ ] **Step 2: Implement shell skeleton**

`OrgRecordShell` props:

```typescript
type OrgRecordShellProps = {
  mode: "tenant" | "platform";
  orgId?: string; // required when mode === "platform"
};
```

Behavior:

1. Auth guard: `hasAdminCredentials` (tenant); platform uses existing `[id]/page` guard pattern
2. Fetch org: `fetchEntity("organizations", orgId ?? tenant.id)`
3. `useContextRail(OrgSectionRail, …, contextParent)` where contextParent is `{ label: "Home", href: "/home" }` or `{ label: "Organizations", href: "/organizations" }`
4. `useOrgRecordPageHeader({ org, mode })`
5. Render header, mobile sections, `AnimatePresence` with placeholder per section ("Coming soon") except Overview
6. Scroll `#main-content` to top on `section` change

- [ ] **Step 3: Replace both page.tsx files**

```tsx
// profile/page.tsx
"use client";
import { OrgRecordShell } from "@/components/org/record/org-record-shell";
export default function OrganizationProfilePage() {
  return <OrgRecordShell mode="tenant" />;
}
```

```tsx
// [id]/page.tsx — keep existing loading guard if needed, then:
return <OrgRecordShell mode="platform" orgId={id} />;
```

- [ ] **Step 4: Run build**

Run: `cd schedjuice-reimagined-fe && pnpm run build`
Expected: PASS (legacy edit routes still exist — OK)

- [ ] **Step 5: Stage only**

---

## Task 7: Overview panel

**Files:**
- Create: `src/components/org/record/sections/org-overview.tsx`
- Modify: `src/components/org/record/org-record-shell.tsx`

- [ ] **Step 1: Implement Overview**

Sections per spec §7:

- Identity summary (name, tagline, domain, timestamps via `formatDateTime`)
- Status chips as `Link` to `orgSectionHref(mode, orgId, sectionId)`
- Quick action text links
- AI budget card: use existing AI settings query for `is_ai_enabled` + usage summary if available; link to `?section=ai&pane=usage`

Use semantic tokens; avoid shadcn Card grid — use whitespace + typography.

- [ ] **Step 2: Wire in shell when `section === "overview"`**

- [ ] **Step 3: Manual test**

Navigate `/organizations/profile?section=overview` — Overview renders; rail switches sections (placeholders OK).

- [ ] **Step 4: Stage only**

---

# Stage C — Schema section forms

## Task 8: Extract field config + shared form hook

**Files:**
- Create: `src/components/org/record/sections/org-field-config.tsx`
- Create: `src/components/org/record/sections/use-org-edit-form.ts`
- Create: `src/components/org/record/sections/org-section-panel.tsx`
- Create: `src/components/org/record/sections/org-schema-section.tsx`

- [ ] **Step 1: Move `fieldConfig` useMemo from `profile/edit/page.tsx`**

Export `useOrgFieldConfig(form, refs)` returning the same `fieldConfig` object. Pass refs:

```typescript
type OrgFieldConfigRefs = {
  wasMicrosoftOnAtLoad: React.MutableRefObject<boolean>;
  wasTelegramOnAtLoad: React.MutableRefObject<boolean>;
  hadTelegramBotAtLoad: React.MutableRefObject<boolean>;
  idCardLogoCleared: boolean;
  setIdCardLogoCleared: (v: boolean) => void;
  onLogoUploadFinished: () => void;
  orgRecord: organizationType | undefined;
  user: accountType | undefined;
  tenant: organizationType | null | undefined;
  refetchTenant: () => void;
  getOrganizationRefetch: () => void;
};
```

- [ ] **Step 2: Implement `useOrgEditForm(orgId)`**

- Loads org via react-query
- Single `useForm` with `organizationOwnerEditSchema`
- Hydrates on success (same logic as edit page `useEffect`)
- Returns `{ form, org, isLoading, isError, refetch, refs… }`

- [ ] **Step 3: Implement `OrgSectionPanel` chrome**

```tsx
export function OrgSectionPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl text-text-primary">{title}</h2>
        {description ? (
          <p className="text-sm text-text-muted">{description}</p>
        ) : null}
      </header>
      {children}
      {footer}
    </div>
  );
}
```

- [ ] **Step 4: Implement `OrgSchemaSection`**

Props: `{ sectionId, mode, orgId, form, fieldConfig, onSaveSuccess }`

- Renders `OrgSectionPanel` with title/description from `getOrgSchemaSectionMeta(sectionId)`
- `AutoFormObject` with `fieldOrder={[...keys]}`
- Section-specific slots passed as `childrenBefore`/`childrenAfter` from shell switch
- Save button: disabled when `!form.formState.isDirty` for that section's keys (use `pickOrgSectionValues` + dirty field names)
- `onSubmit`: run section-specific validation (`validateMicrosoftOwnerSetup` only when `sectionId === "microsoft"`, etc.) → `buildOrgSectionFormData` → `updateEntity("organizations", orgId, formData)`
- Show propagation note on `profile`, `microsoft`, `telegram`, `video`

- [ ] **Step 5: Stage only**

---

## Task 9: Profile + ID cards + integration sections

**Files:**
- Create: `src/components/org/record/sections/org-profile-section.tsx`
- Modify: `src/components/org/record/org-record-shell.tsx`

- [ ] **Step 1: `OrgProfileSection`**

Wrap `OrgSchemaSection` for `profile` with:

- `OrganizationLogoSection`
- Default cover `ImageUploader` (from edit page)

- [ ] **Step 2: Wire schema sections in shell switch**

For each `OrgSectionId` that maps to `ORGANIZATION_PROFILE_EDIT_SECTIONS`:

| sectionId | Extra children |
| --- | --- |
| `profile` | `OrgProfileSection` |
| `id-cards` | `IdCardBrandingSection` |
| `telegram` | `TelegramWebhookActions` after fields |
| `video` | `ZoomAccountsSection`, `PersonalZoomOAuthCard` |
| others | `OrgSchemaSection` only |

- [ ] **Step 3: OAuth callback handling in shell**

Move Zoom OAuth `useEffect` blocks from edit page into shell (or `useOrgOAuthCallbacks` hook). Replace targets:

```typescript
router.replace(orgSectionHref(mode, orgId, "video"));
```

- [ ] **Step 4: Manual test each integration section**

Microsoft toggle shows/hides fields; telegram token; check-in conditional fields.

- [ ] **Step 5: Stage only**

---

# Stage D — Branding + AI

## Task 10: Branding section

**Files:**
- Create: `src/components/org/record/sections/org-branding-section.tsx`

- [ ] **Step 1: Port theme page body**

Move JSX from `organizations/profile/theme/page.tsx` into `OrgBrandingSection`:

- `useColors()` state
- Color selectors + demo preview
- Save button calls `saveTheme(colors)` — independent of org form

- [ ] **Step 2: Wire `section === "branding"` in shell**

- [ ] **Step 3: Stage only**

---

## Task 11: Move AI components + AI section

**Files:**
- Create: `src/components/org/ai/ai-usage-tabs.tsx` (move + edit)
- Create: `src/components/org/ai/usage-trend-bars.tsx` (move)
- Create: `src/components/org/ai/failures-table.tsx` (move)
- Create: `src/components/org/record/sections/org-ai-section.tsx`
- Create: `src/components/org/record/sections/org-ai-settings-pane.tsx`
- Create: `src/components/org/record/sections/org-ai-usage-pane.tsx`
- Create: `src/components/org/record/sections/org-ai-failures-pane.tsx`

- [ ] **Step 1: Move `_components` to `src/components/org/ai/`**

Update internal imports.

- [ ] **Step 2: Retarget `AiUsageTabs`**

```typescript
// ai-usage-tabs.tsx
import { orgSectionHref } from "@/lib/org/org-section-href";

export function AiUsageTabs({
  mode,
  orgId,
  dateParam,
  active,
}: {
  mode: "tenant" | "platform";
  orgId: string | number;
  dateParam: string;
  active: "overview" | "failures";
}) {
  const settingsBase = orgSectionHref(mode, orgId, "ai", { pane: "usage", date: dateParam });
  const failuresHref = orgSectionHref(mode, orgId, "ai", { pane: "failures", date: dateParam });
  // tab row links: pane=settings | usage | failures
}
```

- [ ] **Step 3: Port ai-settings form to `OrgAiSettingsPane`**

Extract form JSX from `ai-settings/page.tsx`; accept `orgId` prop.

- [ ] **Step 4: Port usage + failures panes**

From `ai-usage/page.tsx` and `failures/page.tsx`; pass `orgId`, `mode`, `date` from URL (`parseAsIsoDateTime` nuqs in shell or pane).

- [ ] **Step 5: `OrgAiSection` wrapper**

Secondary tab row: Settings · Usage · Failures — uses `setPane` from `useOrgSection`.

Gate Usage/Failures with `canViewOrgAiUsagePane(ctx)`.

- [ ] **Step 6: Wire in shell; manual test AI save + usage chart**

- [ ] **Step 7: Stage only**

---

# Stage E — Platform sections

## Task 12: Billing + Admins sections

**Files:**
- Create: `src/components/org/record/sections/org-billing-section.tsx`
- Create: `src/components/org/record/sections/org-admins-section.tsx`

- [ ] **Step 1: Port billing page body**

Extract inner content from `[id]/billing/page.tsx` into `OrgBillingSection` (drop `BackButton`, wrap in `OrgSectionPanel`).

- [ ] **Step 2: Implement admins section**

Use org details from `[id]/page.tsx` admin table if present, or fetch admins list. Primary CTA:

```tsx
<Link href={`/organizations/${orgId}/admins/create`}>Add admin</Link>
```

- [ ] **Step 3: Wire only when `mode === "platform"`**

- [ ] **Step 4: Manual test on `/organizations/{otherOrgId}?section=billing`**

- [ ] **Step 5: Stage only**

---

# Stage F — Delete legacy routes + link sweep

## Task 13: Update inbound links

**Files:** (see spec §4.3)

- [ ] **Step 1: Update nav-routes**

```typescript
// AI Usage href:
href: "/organizations/profile?section=ai&pane=usage",
// Billing — use dynamic helper in nav render OR document that platform billing nav uses tenant-unaware path; update to `/organizations/profile?section=billing` only for tenant org billing if applicable, else keep platform org list entry pointing to org detail with section:
// For platform nav Billing entry, change to `/organizations` with note — OR resolve tenant id in nav component:
href: (tenant) => `/organizations/${tenant.id}?section=billing`, // if nav supports function hrefs; else update manually per nav-routes pattern
```

Inspect `nav-routes.tsx` — if `href` must be static string, add `resolveNavHref` pattern or split Billing nav item to platform-only with `/organizations` + user picks org. **Preferred:** remove standalone Billing nav item; billing accessed from org `[id]` shell Platform section.

- [ ] **Step 2: Update course-header + course-zoom links**

```typescript
const orgSettingsHref = "/organizations/profile?section=video";
// was /organizations/profile/edit
```

- [ ] **Step 3: Update id-card pages**

```typescript
href="/organizations/profile?section=id-cards"
// settings page: router.replace("/organizations/profile?section=id-cards")
```

- [ ] **Step 4: Update changelog entry href**

- [ ] **Step 5: Update `ai-usage-panel.tsx` import path**

- [ ] **Step 6: Stage only**

---

## Task 14: Route permissions + org-route-access

**Files:**
- Modify: `src/config/route-permissions.ts`
- Modify: `src/config/__tests__/route-permissions.test.ts`
- Modify: `src/lib/org-route-access.ts`
- Modify: `src/lib/__tests__/org-route-access.test.ts`

- [ ] **Step 1: Remove deleted path rules**

Delete lines for `/organizations/ai-usage/failures` and `/organizations/ai-usage`.

Add explicit rule if needed:

```typescript
{ prefix: "/organizations/profile", anyOf: ["org.configure", "ai.usage.view"] },
```

(`/organizations/[id]` already covered by `/organizations` prefix rule.)

- [ ] **Step 2: Update tests**

Replace ai-usage path tests with:

```typescript
it("resolves /organizations/profile?section=ai to org.configure or ai.usage.view via prefix", () => {
  expect(ruleForPath("/organizations/profile")?.anyOf).toContain("org.configure");
});
```

- [ ] **Step 3: Simplify `org-route-access.ts`**

Remove branches for `/organizations/ai-settings` and `/organizations/ai-usage` (tenant paths no longer exist).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/config/__tests__/route-permissions.test.ts src/lib/__tests__/org-route-access.test.ts`

- [ ] **Step 5: Stage only**

---

## Task 15: Delete legacy route files

**Files:** Delete list from spec §4.2

- [ ] **Step 1: Verify no remaining imports to deleted pages**

Run: `rg "organizations/profile/edit|organizations/ai-settings|organizations/ai-usage|organizations/profile/theme|organizations/\\[id\\]/edit" schedjuice-reimagined-fe/src`

Expected: no hits (except spec/plan docs)

- [ ] **Step 2: Delete route files and empty directories**

- [ ] **Step 3: Run build + tests**

Run: `pnpm run build && pnpm vitest run`

- [ ] **Step 4: Manual regression checklist (spec §14)**

- [ ] **Step 5: Stage only**

---

## Task 16: Final verification

- [ ] **Step 1: Confirm deleted routes 404**

Hit `/organizations/profile/edit`, `/organizations/ai-settings`, `/organizations/ai-usage` — expect Next 404.

- [ ] **Step 2: Confirm no redirect shims exist**

Run: `rg "router\\.replace.*profile/edit|router\\.replace.*ai-settings" schedjuice-reimagined-fe/src`

Expected: no matches

- [ ] **Step 3: Stage only — ready for user-authorized commit**

---

## Spec coverage self-review

| Spec section | Task(s) |
| --- | --- |
| §4 Routes & cleanup | 13, 14, 15 |
| §5 Context rail IA | 1, 4 |
| §6 Layout & shell | 5, 6 |
| §7 Overview | 7 |
| §8 Settings panels | 8, 9 |
| §9 AI section | 11 |
| §10 Platform sections | 12 |
| §11 Auth | 1, 6, 14 |
| §12 Responsive/motion | 4, 6 |
| §13 Error handling | 6, 8 |
| §14 Testing | 16 + per-task manual steps |

**Placeholder scan:** None — all tasks name concrete files and patterns.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-28-org-record-settings.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
