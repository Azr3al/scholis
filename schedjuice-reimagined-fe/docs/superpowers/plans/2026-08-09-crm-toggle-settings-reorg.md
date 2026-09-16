# CRM Toggle + Org Settings IA Reorganization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `is_crm_enabled` (default off) with nav + route guards, fix duplicate org section titles and double borders, and reorganize all org settings behind a unified registry with correct IA (Access, Courses, Integrations, Feature toggles, Localizations).

**Architecture:** Backend adds one boolean on `Organization`. Frontend introduces `org-settings-registry.ts` as the single source of truth for rail groups, panel metadata, form sub-groups, and overview chips. `OrgSchemaSectionPanel` renders one `h2` per section and optional inner `h3` sub-groups via `AutoFormGroupSection` `hideHeader`. CRM middleware gate uses a pure helper tested independently.

**Tech Stack:** Django / DRF; Next.js 15 / React 19 / Zod / Vitest; `./scripts/run_backend_tests.sh` (always `--keepdb`).

**Spec:** `docs/superpowers/specs/2026-08-09-crm-toggle-settings-reorg-design.md` (approved)

## Global Constraints

- High-value tests only: auth/RBAC, feature gates, registry parity, header duplication — no happy-path-only smoke.
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (`--keepdb --noinput` via script).
- Frontend tests: `cd schedjuice-reimagined-fe && pnpm exec vitest run <path>`.
- Do **not** commit unless the user explicitly asks (skip commit steps until requested).
- Never touch dev/Railway DB; use Docker test DB for backend tests.
- No backend CRM API enforcement (UX gate only).
- Tenant cookie adds **only** `is_crm_enabled` (not other toggles).
- Removed section ids: `access-library`, `reports-billing`, `region-currency`, `boards`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `schedjuice-reimagined-be/app_organization/models.py` | `is_crm_enabled` field |
| `schedjuice-reimagined-be/app_organization/migrations/00XX_*.py` | Additive migration |
| `schedjuice-reimagined-be/app_organization/serializers.py` | Field on public + owner serializers (inherits model fields) |
| `schedjuice-reimagined-fe/src/types/organization.ts` | Zod field |
| `schedjuice-reimagined-fe/src/lib/tenant-cookie.ts` | Cookie payload |
| `schedjuice-reimagined-fe/src/lib/org/tenant-feature-route-gates.ts` | **Create** — pure redirect helpers |
| `schedjuice-reimagined-fe/src/lib/org/tenant-feature-route-gates.test.ts` | **Create** — gate tests |
| `schedjuice-reimagined-fe/src/middleware.ts` | Call gate helper for `/crm` |
| `schedjuice-reimagined-fe/src/config/org-settings-registry.ts` | **Create** — full IA registry |
| `schedjuice-reimagined-fe/src/config/org-settings-registry.test.ts` | **Create** — schema parity |
| `schedjuice-reimagined-fe/src/config/organization-profile-sections.ts` | Derive flat sections from registry |
| `schedjuice-reimagined-fe/src/config/org-record-sections.ts` | Derive rail from registry |
| `schedjuice-reimagined-fe/src/components/auto-form/auto-form-group.tsx` | `hideHeader` prop |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-schema-section-panel.tsx` | Multi sub-group render |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-schema-section-panel.test.tsx` | **Create** — header count |
| `schedjuice-reimagined-fe/src/components/org/record/sections/org-overview.tsx` | Grouped chips + quick links |
| `schedjuice-reimagined-fe/src/components/org/record/org-record-shell.tsx` | New section ids, border fix |
| `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx` | CRM notification `renderParent` |
| `schedjuice-reimagined-fe/src/config/nav-routes.tsx` | CRM `canShow` |
| `schedjuice-reimagined-fe/src/lib/org/org-dirty-sections.ts` | Use registry flat keys |
| `schedjuice-reimagined-fe/src/lib/org/build-org-section-payload.test.ts` | Update section id assertions |
| `schedjuice-reimagined-fe/src/lib/org/org-dirty-sections.test.ts` | Update section id assertions |
| `schedjuice-reimagined-fe/src/lib/org/org-section-scroll-spy.test.ts` | Update section ids |
| `schedjuice-reimagined-fe/src/components/nav/__tests__/nav-visibility.test.ts` | CRM gate test |

---

### Task 1: Backend — `is_crm_enabled`

**Files:**
- Modify: `schedjuice-reimagined-be/app_organization/models.py` (in `# feature toggles` block, near `is_staff_points_enabled`)
- Create: `schedjuice-reimagined-be/app_organization/migrations/00XX_organization_is_crm_enabled.py`
- Modify: `schedjuice-reimagined-be/app_demo/org_config.py` (if `ALLOWED_ORG_TOGGLE_KEYS` exists — add key)

**Interfaces:**
- Produces: `Organization.is_crm_enabled: bool` default `False`, exposed on `OrganizationSerializer` / `OrganizationTenantPublicSerializer` automatically unless excluded.

- [ ] **Step 1: Add model field**

```python
is_crm_enabled = models.BooleanField(
    default=False,
    help_text="When True, CRM (Leads and Issues) is visible in the app.",
)
```

- [ ] **Step 2: Create migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_organization --name organization_is_crm_enabled
```

- [ ] **Step 3: Add demo toggle key** (if `ALLOWED_ORG_TOGGLE_KEYS` is used)

Add `"is_crm_enabled"` to the allowlist in `app_demo/org_config.py`.

- [ ] **Step 4: Verify serializer exposure**

Grep `OrganizationSerializer` / `Meta.exclude` — confirm `is_crm_enabled` is not excluded. No code change expected if model fields are included by default.

- [ ] **Step 5: Run a focused backend test**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_organization.tests.test_organization_public_serializer -v 2
```

If no such module exists, run any existing org serializer test or add one assertion in Task 8 backend slice. Expected: PASS.

---

### Task 2: Frontend types, cookie, and route gate helper

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/tenant-cookie.ts`
- Create: `schedjuice-reimagined-fe/src/lib/org/tenant-feature-route-gates.ts`
- Create: `schedjuice-reimagined-fe/src/lib/org/tenant-feature-route-gates.test.ts`
- Modify: `schedjuice-reimagined-fe/src/middleware.ts`

**Interfaces:**
- Produces:

```ts
// tenant-feature-route-gates.ts
export function tenantFeatureRedirectPath(
  pathname: string,
  tenant: Pick<organizationType, "is_library_disabled" | "is_crm_enabled">,
): "/home" | null;
```

- [ ] **Step 1: Write failing gate tests**

```ts
// tenant-feature-route-gates.test.ts
import { describe, expect, it } from "vitest";
import { tenantFeatureRedirectPath } from "./tenant-feature-route-gates";

describe("tenantFeatureRedirectPath", () => {
  it("redirects /crm when CRM disabled", () => {
    expect(
      tenantFeatureRedirectPath("/crm/leads", { is_crm_enabled: false, is_library_disabled: false }),
    ).toBe("/home");
  });

  it("allows /crm when CRM enabled", () => {
    expect(
      tenantFeatureRedirectPath("/crm/issues/settings", { is_crm_enabled: true, is_library_disabled: false }),
    ).toBeNull();
  });

  it("redirects library paths when library disabled", () => {
    expect(
      tenantFeatureRedirectPath("/courses/1/library", { is_crm_enabled: true, is_library_disabled: true }),
    ).toBe("/home");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-fe
pnpm exec vitest run src/lib/org/tenant-feature-route-gates.test.ts
```

- [ ] **Step 3: Implement helper**

```ts
import type { organizationType } from "@/types/organization";

export function tenantFeatureRedirectPath(
  pathname: string,
  tenant: Pick<organizationType, "is_library_disabled" | "is_crm_enabled">,
): "/home" | null {
  if (pathname.includes("library") && tenant.is_library_disabled) {
    return "/home";
  }
  if (pathname.startsWith("/crm") && !tenant.is_crm_enabled) {
    return "/home";
  }
  return null;
}
```

- [ ] **Step 4: Add Zod field** (in `organizationFieldsSchema`, feature toggles area)

```ts
is_crm_enabled: z.boolean().default(false).describe("Enable CRM"),
```

- [ ] **Step 5: Extend tenant cookie**

In `TenantCookiePayload` Pick type and `toTenantCookiePayload`:

```ts
is_crm_enabled: Boolean(org.is_crm_enabled),
```

Update `tenant-cookie.test.ts` to expect `is_crm_enabled` in payload.

- [ ] **Step 6: Wire middleware**

Replace inline library check with:

```ts
import { tenantFeatureRedirectPath } from "@/lib/org/tenant-feature-route-gates";

// inside logged-in branch, early:
const featureRedirect = tenantFeatureRedirectPath(request.nextUrl.pathname, tenant);
if (featureRedirect) {
  return NextResponse.redirect(new URL(featureRedirect, request.url));
}
```

Remove the old standalone `library` `includes` block to avoid duplication.

- [ ] **Step 7: Run tests — expect PASS**

```bash
pnpm exec vitest run src/lib/org/tenant-feature-route-gates.test.ts src/lib/tenant-cookie.test.ts
```

---

### Task 3: Unified org settings registry

**Files:**
- Create: `schedjuice-reimagined-fe/src/config/org-settings-registry.ts`
- Create: `schedjuice-reimagined-fe/src/config/org-settings-registry.test.ts`

**Interfaces:**
- Produces:
  - `ORG_SETTINGS_REGISTRY: OrgSettingsRegistryEntry[]`
  - `getRegistryEntry(id: string)`
  - `getRegistryFlatKeys(sectionId: string): readonly string[]`
  - `assertRegistrySchemaParity()` (dev-only, called at module load)
  - Types: `OrgSettingsSubGroup`, `OrgSettingsRegistryEntry`, extended `OrgSectionGroup`, extended `OrgSectionId`

- [ ] **Step 1: Write failing parity test**

```ts
import { describe, expect, it } from "vitest";
import { getObjectFormSchema } from "@/components/auto-form";
import { organizationOwnerEditSchema } from "@/types/organization";
import { ORG_SETTINGS_REGISTRY, getRegistryFlatKeys } from "./org-settings-registry";

describe("org-settings-registry", () => {
  it("assigns every owner-edit schema key exactly once", () => {
    const schemaKeys = Object.keys(getObjectFormSchema(organizationOwnerEditSchema).shape);
    const registryKeys = ORG_SETTINGS_REGISTRY.flatMap((e) =>
      e.subGroups ? e.subGroups.flatMap((g) => [...g.keys]) : [],
    );
    const missing = schemaKeys.filter((k) => !registryKeys.includes(k));
    const extra = registryKeys.filter((k) => !schemaKeys.includes(k));
    const dupes = registryKeys.filter((k, i) => registryKeys.indexOf(k) !== i);
    expect({ missing, extra, dupes }).toEqual({ missing: [], extra: [], dupes: [] });
  });

  it("maps is_wd_we_course_types_enabled to courses not reports", () => {
    expect(getRegistryFlatKeys("courses")).toContain("is_wd_we_course_types_enabled");
    expect(getRegistryFlatKeys("reports")).not.toContain("is_wd_we_course_types_enabled");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec vitest run src/config/org-settings-registry.test.ts
```

- [ ] **Step 3: Implement registry** with these entries (sub-group keys must match spec field audit exactly):

| `id` | `group` | `label` | Sub-groups |
| --- | --- | --- | --- |
| `overview` | `top` | Overview | custom panel |
| `profile` | `school` | Profile | single: `name`, `description`, `tagline` |
| `branding` | `school` | Branding | `customPanel: "branding"` |
| `id-cards` | `school` | ID cards | single: all id_card keys + `is_course_id_card_expiry_enabled` |
| `login-domains` | `access` | Login & domains | **Login:** `is_student_login_disabled` · **Email domains:** `available_domains` |
| `courses` | `courses` | Courses | **Policies & roles:** `can_teacher_create_course`, `auto_assign_creator_as_main_teacher`, `is_course_role_enabled`, `is_substitute_teachers_enabled` · **Teaching subjects:** `teaching_subjects_allow_level_category_search` · **Scheduling defaults:** `default_session_start_time`, `default_session_duration_minutes`, `is_wd_we_course_types_enabled` · **Course display:** `is_fm_hm_course_display_enabled`, `is_exam_board_in_course_enabled` |
| `microsoft` | `integrations` | Microsoft Teams | single: all existing microsoft keys |
| `telegram` | `integrations` | Telegram | single: all existing telegram keys |
| `google` | `integrations` | Google | single: google keys |
| `consultation` | `integrations` | Consultation | single |
| `video` | `integrations` | Video meetings | single: `video_conferencing_platform` |
| `library` | `feature-toggles` | Library | single: `is_library_disabled`, `library_title` |
| `crm` | `feature-toggles` | CRM | **Module:** `is_crm_enabled` · **Notifications:** `notify_lead_observers_on_status_change`, `notify_issue_observers_on_status_change` |
| `checkin` | `feature-toggles` | Attendance tracking | single: all checkin keys |
| `staff-payroll` | `feature-toggles` | Staff & payroll | **Payroll:** `is_payroll_calculation_enabled`, `payroll_calculation_strategy`, `supports_course_specific_rates`, `can_teacher_see_self_earnings` · **HR & staff points:** `is_hr_fields_enabled`, `is_staff_points_enabled` · **Alumni:** `alumni_grace_period_day`, `cost_per_account_per_day` |
| `reports` | `feature-toggles` | Reports | single: `report_style`, `course_sheet_template` |
| `invoicing` | `feature-toggles` | Invoicing | **Payment plans:** `default_student_payment_plan`, `is_payment_plan_mandatory` · **Discounts:** `is_legacy_discount_visible`, `is_discount_eligibility_enabled` · **Payment capture:** `transaction_screenshot_strategy` · **Invoice generation:** `invoice_generation_strategy`, `invoice_generation_interval_days` |
| `region-time` | `localizations` | Region & time | single: `timezone`, `time_display_format` |
| `currency` | `localizations` | Currency | single: `currency_fullname`, `currency_symbol`, `currency_iso4217` |
| `ai` | `intelligence` | AI | `customPanel: "ai"` |
| `billing` | `platform` | Billing | `customPanel: "billing"` |
| `admins` | `platform` | Admins | `customPanel: "admins"` |

Add `overviewChip` on: `microsoft`, `telegram`, `google`, `consultation`, `video`, `library`, `crm`, `checkin`, `staff-payroll` (payroll + staff points chips), `ai`.

Panel `title` / `description` should differ from sub-group titles where sub-groups exist (e.g. Invoicing panel description is about the whole section; sub-groups name Payment plans, etc.).

- [ ] **Step 4: Run parity test — expect PASS**

```bash
pnpm exec vitest run src/config/org-settings-registry.test.ts
```

---

### Task 4: Derive legacy config modules from registry

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/organization-profile-sections.ts`
- Modify: `schedjuice-reimagined-fe/src/config/org-record-sections.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/org/org-dirty-sections.ts`

**Interfaces:**
- Consumes: `ORG_SETTINGS_REGISTRY`, `getRegistryFlatKeys`, `getRegistryEntry`
- Produces: backward-compatible exports:
  - `ORGANIZATION_PROFILE_EDIT_SECTIONS` — `{ id, title, description, keys: flatKeys }[]` for schema sections only
  - `getOrgSchemaSectionKeys(id)` — flat keys
  - `getOrgSchemaSectionMeta(id)` — `{ title, description }` from registry
  - `ORG_SECTIONS`, `OrgSectionId`, `ORG_GROUP_LABELS`, `ORG_GROUP_ORDER` from registry

- [ ] **Step 1: Refactor `organization-profile-sections.ts`**

Replace hard-coded array with derivation:

```ts
import { ORG_SETTINGS_REGISTRY, getRegistryFlatKeys } from "./org-settings-registry";

export const ORGANIZATION_PROFILE_EDIT_SECTIONS = ORG_SETTINGS_REGISTRY.filter(
  (e) => !e.customPanel && e.subGroups?.length,
).map((e) => ({
  id: e.id,
  title: e.title,
  description: e.description ?? "",
  keys: getRegistryFlatKeys(e.id),
}));
```

Keep dev parity assertion (now redundant with registry test — ok to keep as belt-and-suspenders).

- [ ] **Step 2: Refactor `org-record-sections.ts`**

Import `OrgSectionGroup` labels/order from registry. Build `ORG_SECTIONS` from registry entries with `visible` defaults (`hasAdminCredentials` for schema sections, existing AI/platform visibility).

- [ ] **Step 3: Update `org-dirty-sections.ts`** if it still imports old shape — should work unchanged once `ORGANIZATION_PROFILE_EDIT_SECTIONS` keys update.

- [ ] **Step 4: Update tests with old section ids**

In `build-org-section-payload.test.ts`:
- `reports-billing` → split assertions across `courses` and `reports` / `invoicing`
- `region-currency` → `region-time` + `currency`

In `org-dirty-sections.test.ts`:
- `reports-billing` → `courses` for `is_wd_we_course_types_enabled`
- `access-library` → `login-domains` for `available_domains`

In `org-section-scroll-spy.test.ts`: replace `reports-billing` with `invoicing`.

```bash
pnpm exec vitest run src/lib/org/build-org-section-payload.test.ts src/lib/org/org-dirty-sections.test.ts src/lib/org/org-section-scroll-spy.test.ts
```

Expected: PASS

---

### Task 5: Fix duplicate nested titles (`hideHeader` + multi sub-group panel)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/auto-form/auto-form-group.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-schema-section-panel.tsx`
- Create: `schedjuice-reimagined-fe/src/components/org/record/sections/org-schema-section-panel.test.tsx`

**Interfaces:**
- Consumes: `getRegistryEntry(sectionId)` from registry
- Produces: `AutoFormGroupSection({ hideHeader?: boolean })` — when true, skip the header block entirely (lines 41–75), render fields only.

- [ ] **Step 1: Write failing panel test**

Use `@testing-library/react`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrgSchemaSectionPanel } from "./org-schema-section-panel";

// Minimal form mock — use FormProvider + empty default values
describe("OrgSchemaSectionPanel headers", () => {
  it("renders one h2 for single-sub-group sections (reports)", () => {
    render(/* OrgSchemaSectionPanel sectionId="reports" with stub form */);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("renders h2 plus h3 sub-groups for invoicing", () => {
    render(/* sectionId="invoicing" */);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Add `hideHeader` to `AutoFormGroupSection`**

When `hideHeader` is true, render only the fields container (no title button/h3).

- [ ] **Step 3: Rewrite `OrgSchemaSectionPanel`**

```tsx
const entry = getRegistryEntry(sectionId);
if (!entry?.subGroups?.length) return null;

return (
  <OrgSectionPanel title={entry.title} description={entry.description} footer={...}>
    <FormProvider {...form}>
      {childrenBefore}
      {entry.subGroups.map((sub) => (
        <AutoFormGroupSection
          key={sub.id}
          hideHeader={entry.subGroups!.length === 1}
          group={{
            id: sub.id,
            title: sub.title,
            description: sub.description,
            fields: [...sub.keys],
          }}
          shape={objectFormSchema.shape}
          fieldConfig={fieldConfig}
        />
      ))}
      {childrenAfter}
    </FormProvider>
  </OrgSectionPanel>
);
```

Remove duplicate meta from old single-group pattern.

- [ ] **Step 4: Run panel tests — expect PASS**

```bash
pnpm exec vitest run src/components/org/record/sections/org-schema-section-panel.test.tsx
```

---

### Task 6: Org record shell — section ids, groups, border fix

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/org/record/org-record-shell.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/course/record/course-record-overview.tsx` (if duplicate `border-x`)

**Interfaces:**
- Consumes: updated `OrgSectionId`, registry-derived `SCHEMA_SECTION_IDS`

- [ ] **Step 1: Update `SCHEMA_SECTION_IDS`**

Replace old ids with registry schema section ids:

```ts
const SCHEMA_SECTION_IDS = ORG_SETTINGS_REGISTRY.filter((e) => !e.customPanel).map((e) => e.id);
```

Exclude `overview` if not a schema section.

- [ ] **Step 2: Remove double border**

In `org-record-shell.tsx` line ~512, change:

```ts
"sj-root flex flex-col gap-16 border-x border-border pb-32 pt-2",
```

to:

```ts
"sj-root flex flex-col gap-16 pb-32 pt-2",
```

- [ ] **Step 3: Audit course record overview** for same `border-x` inside `PageContainer` — remove inner duplicate if present.

- [ ] **Step 4: Manual smoke**

Load `/organizations/profile` — confirm single vertical border and new rail groups (School, Access, Courses, Integrations, Feature toggles, Localizations).

---

### Task 7: Overview grouped chips and quick links

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/org/record/sections/org-overview.tsx`

**Interfaces:**
- Consumes: `ORG_SETTINGS_REGISTRY` entries with `overviewChip`, grouped by chip category (`integrations` | `feature-toggles` | `intelligence`)

- [ ] **Step 1: Replace flat chip row**

Render three labeled sections:

```tsx
function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}
```

Map registry entries to chips. Add **Library** chip (`is_library_disabled` inverted). Add **CRM** chip. Split staff-payroll into **Payroll** and **Staff points** chips from same section entry or two chip defs on `staff-payroll` entry.

- [ ] **Step 2: Update quick links**

```tsx
<OrgSectionLink section="profile">Edit profile</OrgSectionLink>
<OrgSectionLink section="microsoft">Integrations</OrgSectionLink>
<OrgSectionLink section="library">Feature toggles</OrgSectionLink>
<OrgSectionLink section="ai" pane="usage">AI usage</OrgSectionLink>
```

- [ ] **Step 3: Visual check** on overview — grouped chips, no duplicate borders.

---

### Task 8: CRM nav gate + form field gating

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/nav-routes.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/nav/__tests__/nav-visibility.test.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/organization-profile-submit.test.ts` (if exists)

- [ ] **Step 1: Add CRM nav gate**

On CRM parent in `nav-routes.tsx`:

```ts
canShow: (tenant) => Boolean(tenant.is_crm_enabled),
```

- [ ] **Step 2: Write failing nav test**

```ts
it("hides CRM when is_crm_enabled is false even with lead permissions", () => {
  const crmSection = section("CRM");
  const disabledTenant = { id: 1, is_crm_enabled: false } as organizationType;
  const checkerWithLead = makePermissionChecker(["lead.view", "issue.view"]);
  expect(visibleChildren(crmSection, checkerWithLead, disabledTenant, user)).toEqual([]);
});
```

- [ ] **Step 3: Gate CRM notification fields**

In `use-org-record-form.tsx` `fieldConfig`:

```ts
notify_lead_observers_on_status_change: {
  renderParent: ({ form }) => Boolean(form.watch("is_crm_enabled")),
  ...
},
notify_issue_observers_on_status_change: {
  renderParent: ({ form }) => Boolean(form.watch("is_crm_enabled")),
  ...
},
```

Optionally gate `library_title` on `!is_library_disabled`.

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run src/components/nav/__tests__/nav-visibility.test.ts src/helpers/organization-profile-submit.test.ts
```

Expected: PASS

---

### Task 9: Final verification

- [ ] **Step 1: Run frontend unit tests for touched areas**

```bash
cd schedjuice-reimagined-fe
pnpm exec vitest run \
  src/config/org-settings-registry.test.ts \
  src/lib/org/tenant-feature-route-gates.test.ts \
  src/lib/org/build-org-section-payload.test.ts \
  src/lib/org/org-dirty-sections.test.ts \
  src/components/nav/__tests__/nav-visibility.test.ts \
  src/components/org/record/sections/org-schema-section-panel.test.tsx
```

- [ ] **Step 2: Run backend migration smoke**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_organization -v 2
```

- [ ] **Step 3: Update spec status**

In `docs/superpowers/specs/2026-08-09-crm-toggle-settings-reorg-design.md`, set `**Status:** approved`.

- [ ] **Step 4: Manual QA checklist**

- [ ] CRM off → no sidebar CRM; `/crm/leads` redirects to `/home`
- [ ] Enable CRM in org settings → sidebar appears
- [ ] Login & domains — no duplicate h2/h3; two h3 sub-groups visible
- [ ] Reports — single h2, fields immediately below
- [ ] Invoicing — h2 + four h3 sub-groups
- [ ] Orphan fields visible: default student payment plan, default session start/duration
- [ ] Org profile — single vertical border

---

## Spec Coverage Checklist

| Spec requirement | Task |
| --- | --- |
| `is_crm_enabled` BE + serializers | Task 1 |
| Zod + cookie + middleware CRM gate | Task 2 |
| Full field audit / IA | Task 3–4 |
| Unified registry | Task 3–4 |
| Nested title fix | Task 5 |
| Double border fix | Task 6 |
| Overview grouped chips | Task 7 |
| CRM nav `canShow` | Task 8 |
| CRM notification `renderParent` | Task 8 |
| Rail groups (Access, Courses, Integrations, Feature toggles, Localizations) | Task 3–4 |
| Tests per spec | Tasks 2, 3, 5, 8, 9 |

## Follow-up (not in this plan)

- Backend CRM API guard
- Platform bulk-enable CRM for existing tenants
- Split Staff & payroll into separate rail items
