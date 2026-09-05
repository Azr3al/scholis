# CRM feature toggle + org settings IA reorganization

**Status:** approved  
**Date:** 2026-08-09  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Surfaces:** `Organization` model & serializers; tenant cookie & middleware; sidebar nav; org profile overview & settings rail; org form sections

## Context

CRM (Leads, Issues) is always visible in the sidebar when the user holds `lead.view` / `issue.view`. There is no org-level master switch.

Org settings suffer from three IA problems:

1. **Duplicate section titles** — `OrgSectionPanel` renders an `h2` + description, then `OrgSchemaSectionPanel` passes the same title/description into `AutoFormGroupSection`, which renders an `h3` + description again (visible in Reports and billing, Access and library, etc.).

2. **Mixed concerns in sections** — e.g. **Access and library** combines login restrictions, email domains, course-creation policies, teaching-subject catalog behavior, and library module toggle + title.

3. **Config drift** — two parallel configs (`organization-profile-sections.ts`, `org-record-sections.ts`); orphaned fields not assigned to any section; **Boards and trackers** not in the rail.

Other issues: flat overview chips; double `border-x` on org profile (`PageContainer` + `OrgRecordShell`).

## Goals

1. Add `is_crm_enabled` org flag (default `False`); nav + middleware route guard when off.
2. Fix duplicate nested titles across all org schema sections.
3. Full IA restructure: every `organizationOwnerEditSchema` field assigned once, grouped by concern.
4. Unified settings registry driving rail, form sub-groups, and overview chips.
5. Remove double border on org profile.

## Non-goals

- Backend API enforcement when CRM is disabled.
- Collapsible nested rail navigation redesign.
- Tenant cookie expansion beyond `is_crm_enabled`.
- Platform-only fields (`is_demo`, `domain_url`, `is_homepage_disabled`) in owner settings.

---

## Field audit

Every editable owner field, current placement, and proposed home.

| Field | Today | Concern | Proposed section · sub-group |
| --- | --- | --- | --- |
| `name`, `description`, `tagline` | profile | Identity | **Profile** |
| `id_card_*`, `is_course_id_card_expiry_enabled` | id-cards | ID badges | **ID cards** |
| `is_student_login_disabled` | access-library | **Access** | **Login & domains** · Login |
| `available_domains` | access-library | **Access** | **Login & domains** · Email domains |
| `can_teacher_create_course` | access-library | Course policy | **Courses** · Policies & roles |
| `auto_assign_creator_as_main_teacher` | access-library | Course policy | **Courses** · Policies & roles |
| `is_course_role_enabled` | access-library | Course policy | **Courses** · Policies & roles |
| `is_substitute_teachers_enabled` | access-library | Course policy | **Courses** · Policies & roles |
| `teaching_subjects_allow_level_category_search` | access-library | Academics catalog | **Courses** · Teaching subjects |
| `default_session_start_time` | **orphan** | Scheduling default | **Courses** · Scheduling defaults |
| `default_session_duration_minutes` | **orphan** | Scheduling default | **Courses** · Scheduling defaults |
| `is_wd_we_course_types_enabled` | reports-billing | Scheduling nomenclature | **Courses** · Scheduling defaults |
| `is_fm_hm_course_display_enabled` | reports-billing | Course list display | **Courses** · Course display |
| `is_exam_board_in_course_enabled` | reports-billing | Course form | **Courses** · Course display |
| `is_library_disabled` | access-library | Module toggle | **Library** · (master toggle) |
| `library_title` | access-library | Module config | **Library** · (configuration) |
| `is_microsoft_on` + MS credentials | microsoft | Integration | **Microsoft Teams** |
| `is_telegram_on` + bot fields | telegram | Integration | **Telegram** |
| `is_google_on`, `is_google_login_on` | google | Integration | **Google** |
| `is_consultation_booking_on`, `consultation_strategy` | consultation | Integration | **Consultation** |
| `video_conferencing_platform` | video | Integration | **Video meetings** |
| `is_crm_enabled` | **new** | Module toggle | **CRM** · (master toggle) |
| `notify_lead_observers_on_status_change` | boards (orphan) | CRM config | **CRM** · Notifications |
| `notify_issue_observers_on_status_change` | boards (orphan) | CRM config | **CRM** · Notifications |
| `is_building_checkin_enabled` + check-in fields | checkin | Module toggle + config | **Attendance tracking** |
| `is_payroll_calculation_enabled` + payroll fields | staff-payroll | Module toggle + config | **Staff & payroll** · Payroll |
| `is_hr_fields_enabled` | staff-payroll | HR module | **Staff & payroll** · HR |
| `is_staff_points_enabled` | staff-payroll | Module toggle | **Staff & payroll** · Staff points |
| `can_teacher_see_self_earnings` | staff-payroll | Payroll UX | **Staff & payroll** · Payroll |
| `supports_course_specific_rates` | staff-payroll | Payroll | **Staff & payroll** · Payroll |
| `payroll_calculation_strategy` | staff-payroll | Payroll | **Staff & payroll** · Payroll |
| `alumni_grace_period_day` | staff-payroll | Alumni lifecycle | **Staff & payroll** · Alumni |
| `cost_per_account_per_day` | staff-payroll | Platform billing input | **Staff & payroll** · Alumni *(keep; used by platform billing)* |
| `report_style`, `course_sheet_template` | reports-billing | Reporting output | **Reports** |
| `transaction_screenshot_strategy` | reports-billing | Payment UX | **Invoicing** · Payment capture |
| `default_student_payment_plan` | **orphan** | Payment default | **Invoicing** · Payment plans |
| `is_payment_plan_mandatory` | reports-billing | Payment policy | **Invoicing** · Payment plans |
| `is_legacy_discount_visible` | reports-billing | Payment UI | **Invoicing** · Discounts |
| `is_discount_eligibility_enabled` | reports-billing | Payment rules | **Invoicing** · Discounts |
| `invoice_generation_strategy`, `invoice_generation_interval_days` | reports-billing | Invoicing automation | **Invoicing** · Invoice generation |
| `timezone`, `time_display_format` | region-currency | Locale · time | **Region & time** |
| `currency_fullname`, `currency_symbol`, `currency_iso4217` | region-currency | Locale · money | **Currency** |
| `theme` | branding panel (separate API) | Branding | **Branding** *(unchanged custom panel)* |
| `is_demo`, `telegram_bot_id`, read-only templates | schema / N/A | Platform / read-only | Not in owner form sections |

**Removed section ids:** `access-library`, `reports-billing`, `boards`, `region-currency` (split/replaced).

---

## Settings rail structure (full IA)

```
Overview

School
  Profile · Branding · ID cards

Access
  Login & domains

Courses
  Courses                          (single rail item; multiple form sub-groups inside)

Integrations
  Microsoft Teams · Telegram · Google · Consultation · Video meetings

Feature toggles
  Library · CRM · Attendance tracking · Staff & payroll · Reports · Invoicing

Localizations
  Region & time · Currency

Intelligence
  AI

Platform (platform mode only)
  Billing · Admins
```

### Form sub-groups per rail section

Sections with **one** sub-group: panel shows a single `h2` (no inner duplicate).  
Sections with **multiple** sub-groups: panel `h2` + inner `h3` per sub-group.

| Rail section | Panel title | Sub-groups (`h3` when >1) |
| --- | --- | --- |
| `login-domains` | Login & domains | **Login** · **Email domains** |
| `courses` | Courses | **Policies & roles** · **Teaching subjects** · **Scheduling defaults** · **Course display** |
| `library` | Library | *(single group — master toggle then title)* |
| `crm` | CRM | **Module** · **Notifications** |
| `checkin` | Attendance tracking | *(single group)* |
| `staff-payroll` | Staff & payroll | **Payroll** · **HR & staff points** · **Alumni** |
| `reports` | Reports | *(single group)* |
| `invoicing` | Invoicing | **Payment plans** · **Discounts** · **Payment capture** · **Invoice generation** |
| `region-time` | Region & time | *(single group)* |
| `currency` | Currency | *(single group)* |
| Integrations sections | same as today | *(single group each)* |

Integration and single-group sections keep one sub-group internally so no inner title renders.

---

## Fix duplicate nested titles

**Root cause:** `OrgSchemaSectionPanel` wraps `AutoFormGroupSection` with identical `title`/`description` already shown by `OrgSectionPanel`.

**Fix:**

1. Extend `AutoFormGroupSection` with `hideHeader?: boolean` (default `false`).
2. `OrgSchemaSectionPanel` renders:
   - `OrgSectionPanel` — always the page-level `h2` + description (from registry).
   - For each registry sub-group: `AutoFormGroupSection` with `hideHeader={subGroups.length === 1}`.
   - When `hideHeader` is false, sub-group supplies `h3` + optional description (distinct from panel title).
3. Do **not** pass the panel title into the single sub-group when `hideHeader` is true.

**Before (Reports and billing):**

```
h2  Reports and billing          ← OrgSectionPanel
p   Reporting style, screenshots…
h3  Reports and billing          ← AutoFormGroupSection (duplicate)
p   Reporting style, screenshots…
    [Report Style field]
```

**After (Reports):**

```
h2  Reports
p   Templates and styles for exported reports and data sheets.
    [Report Style field]
    [Course data sheet template field]
```

**After (Invoicing with sub-groups):**

```
h2  Invoicing
p   Payment plans, discounts, and invoice automation.
h3  Payment plans
    [Default student payment plan]
    [Require payment plan on every course]
h3  Discounts
    …
```

Apply to **all** schema sections, not only the split ones.

---

## Unified settings registry

New file: `src/config/org-settings-registry.ts`

```ts
type OrgSettingsSubGroup = {
  id: string;
  title: string;
  description?: string;
  keys: readonly string[];
};

type OrgSettingsRegistryEntry = {
  id: OrgSectionId;
  label: string;              // settings rail label
  group: OrgSectionGroup;
  title: string;              // panel h2
  description?: string;       // panel subtitle
  subGroups: OrgSettingsSubGroup[];
  overviewChip?: { label: string; value: (org) => string };
  visible?: (ctx: OrgRecordContext) => boolean;
  customPanel?: "branding" | "ai" | "billing" | "admins"; // non-schema sections
};
```

Dev-time assertion: flatten all `subGroups[].keys` — every `organizationOwnerEditSchema` key exactly once.

`organization-profile-sections.ts` and `org-record-sections.ts` become thin derivations from the registry.

---

## Overview chips

Grouped rows mirroring rail top-level concerns:

```
Integrations
  Microsoft · Telegram · Google · Consultation · Video

Feature toggles
  Library · CRM · Check-in · Payroll · Staff points

Intelligence
  AI
```

No chips for School, Access, Courses, or Localizations (configuration, not on/off modules).

Quick links: **Edit profile** · **Integrations** · **Feature toggles** · **AI usage**

---

## CRM feature toggle

| Layer | Change |
| --- | --- |
| BE | `is_crm_enabled = BooleanField(default=False)`; migration; serializers |
| FE types | Zod + `.describe("Enable CRM")` |
| Nav | `canShow: (tenant) => tenant.is_crm_enabled` on CRM parent |
| Middleware | redirect `/crm/*` when `!tenant.is_crm_enabled` |
| Cookie | add `is_crm_enabled` to `TenantCookiePayload` |
| Form | observer notification fields gated on `is_crm_enabled` |

---

## Double border fix

Remove inner `border-x border-border` from `OrgRecordShell` content wrapper; keep `PageContainer` as sole border. Same audit for `course-record-overview.tsx`.

---

## Group type changes

```ts
type OrgSectionGroup =
  | "top"
  | "school"
  | "access"
  | "courses"           // NEW
  | "integrations"
  | "feature-toggles"
  | "localizations"
  | "intelligence"
  | "platform";
```

Remove `"operations"`. Labels:

| Group | Label |
| --- | --- |
| `school` | School |
| `access` | Access |
| `courses` | Courses |
| `integrations` | Integrations |
| `feature-toggles` | Feature toggles |
| `localizations` | Localizations |
| `intelligence` | Intelligence |
| `platform` | Platform |

---

## Testing

| Test | Asserts |
| --- | --- |
| `nav-visibility.test.ts` | CRM hidden when disabled despite permissions |
| Middleware test | `/crm/leads` redirects when `is_crm_enabled: false` |
| Registry parity | no missing/extra/duplicate schema keys |
| `OrgSchemaSectionPanel` or snapshot | single `h2` when one sub-group; `h2` + `h3` when multiple |
| `organization-profile-submit.test.ts` | CRM off saves cleanly |

---

## Migration / rollout

- `is_crm_enabled=False` by default → CRM hidden until enabled.
- Field moves are UI-only; no data migration.
- Tenants using Leads/Issues must enable CRM post-deploy.

---

## Files touched (expected)

**Backend:** `models.py`, `serializers.py`, migration

**Frontend:**

- `src/config/org-settings-registry.ts` *(new)*
- `src/config/organization-profile-sections.ts`, `org-record-sections.ts` *(derive from registry)*
- `src/components/auto-form/auto-form-group.tsx` *(hideHeader)*
- `src/components/org/record/sections/org-schema-section-panel.tsx` *(multi sub-group render)*
- `src/components/org/record/sections/org-overview.tsx`
- `src/components/org/record/org-record-shell.tsx`
- `src/types/organization.ts`, `tenant-cookie.ts`, `middleware.ts`, `nav-routes.tsx`
- Tests

---

## Follow-up (out of scope)

- Backend CRM API guard
- Split Staff & payroll into separate rail items (Payroll vs Staff points)
- Platform bulk-enable CRM for existing tenants
