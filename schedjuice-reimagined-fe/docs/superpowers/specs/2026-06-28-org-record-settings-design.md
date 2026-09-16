# Organization Record — Context Rail + Unified Settings — Design Spec

> Redesign tenant org profile and platform org management into a single inline workspace with a contextual sidebar swap, grouped settings sections, and an AI panel — mirroring the user record and course record shells.

**Status:** Design approved (brainstorming 2026-06-28). Ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type, motion §12, layout §9, banned list §14.
**Predecessors:**
- P2a app shell — `2026-06-21-app-shell-sidebar-design.md`
- P2b user record — `2026-06-21-user-record-inline-design.md`
- Record-mode dual-path nav — `2026-06-22-record-mode-global-nav-design.md`
- Course record shell — `2026-06-24-course-record-shell-design.md`

---

## 1. Context

Organization settings today are fragmented across multiple standalone pages on legacy shadcn Card layouts:

| Surface | Route | Problem |
| --- | --- | --- |
| Read-only profile | `/organizations/profile` | Minimal card; Edit / Theme / AI are separate links |
| Owner edit form | `/organizations/profile/edit` | One long scroll (~600 lines); 10 stacked cards; no sidebar; Zoom sections orphaned below form |
| Theme | `/organizations/profile/theme` | Separate page |
| AI settings | `/organizations/ai-settings` | Separate page with back button |
| AI usage | `/organizations/ai-usage/**` | Separate routes + tab component |
| Superadmin edit | `/organizations/[id]/edit` | Duplicate of owner edit pattern |
| Superadmin AI usage | `/organizations/[id]/ai-usage/**` | Duplicate of tenant AI usage |

Field grouping already exists in `organization-profile-sections.ts` but is only used to stack cards vertically. This spec reshells org settings into the **record-mode** pattern shipped for users and courses.

---

## 2. Goals & non-goals

### Goals

1. **Unified org record** — Overview (read-only) plus all settings sections in one shell per audience.
2. **Contextual sidebar swap** — `useContextRail` + grouped section rail; global nav collapses to icons (same as user/course record).
3. **Flat rail with group headers** (Approach 1) — scannable one-click navigation; groups labeled School, Access, Integrations, Operations, Intelligence, Platform.
4. **Single-page section switching** — `?section=` query param (user record pattern); AI sub-panes via `?pane=`.
5. **Hybrid save model** — per-section save for org schema fields; standalone save for AI settings, theme/branding, and immediate upload for logo/cover.
6. **Shared shell components** — tenant (`/organizations/profile`) and superadmin (`/organizations/[id]`) use the same layout, rail, and section panels; superadmin-only sections gated in the registry.
7. **AI as one rail item** — Settings · Usage · Failures as in-panel tabs.
8. **Hard removal of legacy routes** — delete old page files; update all inbound links in the same PR (no redirects).
9. Motion per `DESIGN.md` §12 via `src/lib/sj/motion.ts`.

### Non-goals (explicitly deferred)

- Reskinning every form field from shadcn Card → primitives (shell first; field chrome incremental).
- Inline editing without explicit Save (future pass, like user record Stage C).
- Org hero parallax / cover upload on the identity header (cover edit stays in Profile section).
- Backend API changes.
- Redirect shims or middleware for deleted URLs — broken bookmarks are acceptable.
- Nav IA changes outside org management routes.

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Shell model | **Unified org record** — Overview + settings sections |
| 2 | Navigation | **Single page + `?section=`** (user record pattern) |
| 3 | Rail structure | **Flat list with group headers** (Approach 1) |
| 4 | Audience | **Both paths, shared components** — tenant + superadmin |
| 5 | Save behavior | **Hybrid** — per-section org PATCH; AI/theme/media own mutations |
| 6 | AI IA | **One rail item** with in-panel panes: Settings · Usage · Failures |
| 7 | Legacy routes | **Delete completely** — no redirects |
| 8 | Context rail | Reuse `useContextRail` + `ContextRailParent` |
| 9 | Primitives / icons | Base UI + `src/components/primitives/*`; Iconoir in new shell code; ban new shadcn/lucide in shell files |

---

## 4. Routes & cleanup

### 4.1 Active routes (after migration)

| Audience | Base URL | Default |
| --- | --- | --- |
| Tenant owner/admin | `/organizations/profile` | `?section=overview` |
| Platform superadmin | `/organizations/[id]` | `?section=overview` |

Query params:

- `section` — active rail section (see §5).
- `pane` — AI sub-pane: `settings` (default) \| `usage` \| `failures`.
- `date` — ISO date for AI usage charts (preserved from current AI usage pages).

**Sub-routes that persist** (rail mounted, no section highlighted — course-record pattern):

- `/organizations/[id]/admins/create`

**Also delete and port into shell:**

- `src/app/(internal)/organizations/[id]/billing/page.tsx` → `?section=billing`

### 4.2 Routes to delete

| Delete | Replacement |
| --- | --- |
| `src/app/(internal)/organizations/profile/edit/page.tsx` | `?section=<id>` on profile shell |
| `src/app/(internal)/organizations/profile/theme/page.tsx` | `?section=branding` |
| `src/app/(internal)/organizations/ai-settings/page.tsx` | `?section=ai&pane=settings` |
| `src/app/(internal)/organizations/ai-usage/page.tsx` | `?section=ai&pane=usage` |
| `src/app/(internal)/organizations/ai-usage/failures/page.tsx` | `?section=ai&pane=failures` |
| `src/app/(internal)/organizations/[id]/edit/page.tsx` | `?section=<id>` on `[id]` shell |
| `src/app/(internal)/organizations/[id]/ai-usage/page.tsx` | `?section=ai&pane=usage` |
| `src/app/(internal)/organizations/[id]/ai-usage/failures/page.tsx` | `?section=ai&pane=failures` |
| `src/app/(internal)/organizations/[id]/billing/page.tsx` | `?section=billing` |

**Keep and relocate shared UI** (not tied to deleted routes):

- `ai-usage/_components/*` → `src/components/org/ai/` (or equivalent)
- Section field logic from current edit page → `src/components/org/sections/*`

### 4.3 Inbound link sweep (same PR)

Update references to deleted paths:

- `src/app/(internal)/organizations/profile/page.tsx` (replaced by new shell)
- `src/config/nav-routes.tsx` — Organization Settings stays `/organizations/profile`; AI Usage → `/organizations/profile?section=ai&pane=usage`; Billing → `/organizations/[id]?section=billing` (dynamic id resolved at render)
- `src/config/route-permissions.ts` + tests — consolidate permissions onto shell base paths
- `src/lib/org-route-access.ts` + tests
- `src/components/course/overveiw/course-header.tsx` — org settings links
- `src/components/course/course-zoom-meeting-edit-section.tsx`
- `src/app/(internal)/id-card/page.tsx`, `id-card/settings/page.tsx`
- `src/content/changelog/entries.ts`
- Zoom / Telegram OAuth callback `router.replace` targets in edit page logic
- Any other grep hits for `/organizations/profile/edit`, `/organizations/ai-settings`, `/organizations/ai-usage`, `/organizations/profile/theme`, `/organizations/[id]/edit`

---

## 5. Context rail IA

Registry: `src/config/org-record-sections.ts` (mirrors `record-sections.ts`).

```ts
type OrgSectionId =
  | "overview"
  | "profile" | "branding" | "id-cards"
  | "access-library"
  | "microsoft" | "telegram" | "video"
  | "reports-billing" | "staff-payroll" | "checkin" | "region-currency"
  | "ai"
  | "billing" | "admins";

type OrgSectionGroup =
  | "school" | "access" | "integrations" | "operations" | "intelligence" | "platform";
```

### 5.1 Section table

| Group | ID | Label | Keys / content | Visible when |
| --- | --- | --- | --- | --- |
| — | `overview` | Overview | Read-only dashboard (§7) | `hasAdminCredentials(viewer)` |
| **School** | `profile` | Profile | `name`, `description`, `tagline` + logo + default cover upload | admin+ |
| | `branding` | Branding | Theme color selectors (from old theme page) | admin+ |
| | `id-cards` | ID cards | `id_card_*` keys + `IdCardBrandingSection` | admin+ |
| **Access** | `access-library` | Access & library | `is_student_login_disabled`, `available_domains`, `can_teacher_create_course`, `is_library_disabled`, `library_title` | admin+ |
| **Integrations** | `microsoft` | Microsoft Teams | All Microsoft keys from `ORGANIZATION_PROFILE_EDIT_SECTIONS` | admin+ |
| | `telegram` | Telegram | Telegram keys + `TelegramWebhookActions` | admin+ |
| | `video` | Video meetings | `video_conferencing_platform` + `ZoomAccountsSection` + `PersonalZoomOAuthCard` | admin+ |
| **Operations** | `reports-billing` | Reports & billing | Report/invoice keys | admin+ |
| | `staff-payroll` | Staff & payroll | Payroll/HR keys | admin+ |
| | `checkin` | Building check-in | Check-in keys (conditional fields) | admin+ |
| | `region-currency` | Region & currency | Timezone + currency keys | admin+ |
| **Intelligence** | `ai` | AI | Sub-panes (§8) | admin+ and AI permission gate |
| **Platform** | `billing` | Billing | Port `[id]/billing` body | platform superadmin on `[id]` route only |
| | `admins` | Admins | Admin list; link to `[id]/admins/create` | platform superadmin on `[id]` route only |

Field keys per section reuse `ORGANIZATION_PROFILE_EDIT_SECTIONS` mapping (1:1 for org schema sections). Dev-time assertion (existing pattern) ensures schema keys ⊆ section keys.

### 5.2 Context parent (rail back link)

| Route | Parent |
| --- | --- |
| `/organizations/profile` | `{ label: "Home", href: "/home" }` |
| `/organizations/[id]` | `{ label: "Organizations", href: "/organizations" }` |

### 5.3 Rail component

`OrgSectionRail` in `src/components/org/record/org-section-rail.tsx`:

- Clone structure from `RecordSectionRail` / `CourseSectionRail`: 208px wipe, `bg-surface-sunken`, Iconoir `NavArrowLeft`, stagger motion.
- Identity block: org logo (square) + truncated name + optional domain.
- Group labels: `text-sm text-text-muted px-2.5 mb-1` (non-interactive), same as `SettingsSidebar`.
- Section buttons: active `bg-surface-active font-medium`; `playClick()` on change; `aria-current="page"` when active.

Mobile: `OrgMobileSections` — horizontal scroll chips with visual group breaks (`RecordMobileSections` pattern).

---

## 6. Layout & shell

### 6.1 File structure (target)

```
src/app/(internal)/organizations/profile/page.tsx     → OrgRecordShell (tenant)
src/app/(internal)/organizations/[id]/page.tsx        → OrgRecordShell (superadmin)
src/app/(internal)/organizations/profile/layout.tsx   → optional; register context rail
src/components/org/record/
  org-record-shell.tsx
  org-record-header.tsx
  org-section-rail.tsx
  org-mobile-sections.tsx
  use-org-section.ts          → nuqs ?section= + ?pane=
  sections/
    org-overview.tsx
    org-section-panel.tsx     → shared panel chrome + per-section form wrapper
    org-ai-section.tsx
    org-branding-section.tsx
    org-billing-section.tsx   → superadmin
    org-admins-section.tsx    → superadmin
src/config/org-record-sections.ts
```

Both `profile/page.tsx` and `[id]/page.tsx` render `<OrgRecordShell mode="tenant" | "platform" orgId={…} />`.

### 6.2 Shell composition

```
OrgRecordShell
├── useContextRail(<OrgSectionRail … />, contextParent)
├── usePageHeader({ breadcrumb, actions })
├── OrgRecordHeader (cover + logo + name + tagline)
├── OrgMobileSections (md:hidden)
└── AnimatePresence mode="wait" → active section component
```

- Wrap header + body in `.sj-root`; body uses `pageContentInsetClassName()` + `border-x border-border` (course overview pattern).
- **Panel header breadcrumb:** tenant — `School settings / {name}`; superadmin — `Organizations / {name}`. Name in Fraunces, truncates.
- **OrgRecordHeader:** adapted from `RecordProfileHeader` — static default cover, org logo, Fraunces title, tagline, domain external link. No cover parallax in this pass.

### 6.3 Section switching

Hook `useOrgSection()` — `nuqs` parsers:

- `section` — default `overview`; validate against `OrgSectionId`.
- `pane` — default `settings`; only meaningful when `section === "ai"`.

On section change: scroll `#main-content` to top (user record pattern).

Motion: `crossfade` variant on panel swap; rail uses `transition.panelWipe`.

---

## 7. Overview panel

Read-only. Three-zone composition (DESIGN.md §9 — no card grid dashboard).

**Zone 1 — Identity summary**

- Org name (Fraunces `--text-2xl`)
- Tagline (`text-secondary`)
- `https://{domain_url}` external link
- Created / updated timestamps (`--text-mono-sm`)

**Zone 2 — Status chips**

Compact linked pills (each → relevant `?section=`):

- Microsoft: On / Off
- Telegram: On / Off (+ @username when connected)
- Video: Teams / Zoom / None
- AI: Enabled / Disabled
- Check-in: On / Off

**Zone 3 — Quick actions + AI glance**

- Text links: Edit profile, Manage integrations, AI usage
- AI budget card when AI enabled: spend vs monthly USD limit, bar chart snippet, link to `?section=ai&pane=usage`
- Small logo preview → `?section=profile`

No Save button on Overview.

---

## 8. Settings panels (org field sections)

### 8.1 Panel chrome

```
Section title     (Fraunces text-2xl)
Description       (text-sm text-text-muted)
[whitespace / rough divider]
Fields            (vertical stack, gap-6)
[whitespace]
Save changes      (primary Button; disabled when pristine)
```

Show subtle “Unsaved changes” when `formState.isDirty`.

### 8.2 Save & submit

- **Per-section PATCH:** submit only keys listed for that section in `ORGANIZATION_PROFILE_EDIT_SECTIONS`.
- Reuse existing helpers: `buildOrganizationOwnerFormData`, `applyIdCardBrandingToPayload`, `validateMicrosoftOwnerSetup`, `validateTelegramOwnerSetup`.
- File fields (`.pem`, telegram token) included when user selected a file.
- **Success:** toast, invalidate org query, `refetchTenant()` when editing own tenant.
- **OAuth callbacks:** Zoom success/error handlers replace to `?section=video` (tenant and `[id]` variants).

### 8.3 Section-specific UI

| Section | Beyond AutoForm fields |
| --- | --- |
| `profile` | `OrganizationLogoSection`, default cover `ImageUploader` |
| `branding` | Color selectors from old theme page; save via theme API (`useColors().saveTheme`) |
| `id-cards` | `IdCardBrandingSection` + QR preview |
| `telegram` | `TelegramWebhookActions` |
| `video` | `ZoomAccountsSection`, `PersonalZoomOAuthCard` |
| `region-currency` | `TimezoneSelector`, `CurrencySelector` |

Port `fieldConfig` and conditional `renderParent` logic from current `profile/edit/page.tsx` unchanged in behavior.

### 8.4 Note footer

Sections that had the global note (“changes can take up to 4 hours…”) show it below the Save button on **Profile** and **Integrations** sections (Microsoft, Telegram, Video).

---

## 9. AI section

Rail item `ai`; in-panel secondary nav (`Tabs` primitive or text tab row):

| `pane` | Label | Content | Save |
| --- | --- | --- | --- |
| `settings` | Settings | Port `organizations/ai-settings/page.tsx` form | `patchAiSettings` |
| `usage` | Usage | `UsageTrendBars` + month `date` param | — |
| `failures` | Failures | `FailuresTable` | — |

- Retarget `AiUsageTabs` hrefs to `?section=ai&pane=usage|failures&date=…`.
- Superadmin: same panes; API scoped to `[id]` org.
- Permission: `ai.usage.view` for Usage/Failures panes; settings pane requires admin credentials (existing AI settings access rules).

Overview AI budget card reads same usage summary query as Usage pane (shared hook).

---

## 10. Platform sections (superadmin)

On `/organizations/[id]` only:

**Billing (`?section=billing`)** — port existing billing page content into section panel chrome.

**Admins (`?section=admins`)** — admin user list/table; primary action links to `/organizations/[id]/admins/create` (sub-route; rail stays mounted, no rail item active on create page).

`visible(ctx)` for Platform group: `ctx.mode === "platform" && isPlatformStaff(viewer)`.

---

## 11. Auth & permissions

| Check | Rule |
| --- | --- |
| Tenant shell | `hasAdminCredentials(user)`; students redirected |
| Platform shell | Platform staff access to `/organizations/[id]` (existing guard) |
| AI Usage panes | `ai.usage.view` |
| Section visibility | `org-record-sections.ts` `visible()` per section |

Update `route-permissions.ts`: remove entries for deleted paths; ensure `/organizations/profile` and `/organizations/[id]` cover admin and AI usage permissions.

---

## 12. Responsive & motion

| Breakpoint | Behavior |
| --- | --- |
| Desktop | Context rail via `useContextRail`; global sidebar icon-only |
| `< md` | No context rail column; `OrgMobileSections` horizontal chips above content |

Motion sources: `src/lib/sj/motion.ts` — `crossfade`, `transition.panelWipe`, `staggerList` / `staggerItem`.

Sound: `playClick()` on section change (not on initial load).

---

## 13. Error handling

- Org fetch failure: alert panel with Retry (user record pattern).
- Section save failure: `setFormErrors` + destructive toast.
- AI settings save failure: existing toast behavior.
- Invalid `?section=` param: fall back to `overview`.

---

## 14. Testing checklist

- [ ] Tenant shell loads at `/organizations/profile?section=overview`
- [ ] Each rail section renders correct fields; conditional Microsoft/Telegram/check-in visibility unchanged
- [ ] Per-section save PATCHes only that section's keys
- [ ] Branding save updates theme; logo/cover upload works in Profile
- [ ] AI panes: settings save, usage chart, failures table with date param
- [ ] Superadmin shell at `/organizations/[id]` shows Platform group; tenant shell hides it
- [ ] Deleted routes return 404; no redirect routes exist
- [ ] Nav, course-header, id-card links point to new `?section=` URLs
- [ ] Zoom OAuth callback lands on `?section=video`
- [ ] Mobile section chips match desktop rail entries
- [ ] `route-permissions` tests updated

---

## 15. Migration sequence (implementation hint)

1. Add config + hooks + shell components (no route deletes yet).
2. Replace `profile/page.tsx` and `[id]/page.tsx` with shell.
3. Port section panels from edit page incrementally.
4. Port AI + branding + platform sections.
5. Link sweep + delete legacy route files.
6. Update permissions tests.

(Full task breakdown belongs in the implementation plan via `writing-plans`.)
