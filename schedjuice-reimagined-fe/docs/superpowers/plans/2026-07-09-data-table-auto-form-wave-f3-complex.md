# Wave F3 — Complex Overrides + Delete Legacy AutoForm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Finish complex `fieldType` / override consumers on the new auto-form Field map; then **delete** `src/components/ui/auto-form.tsx` and prove zero imports.

**Depends on:** F1 + F2.  
**Branch:** `migrate/ui-f3-complex`

---

## Inventory (complex)

| Path / module | Override focus |
| --- | --- |
| `visibilities/create` + `visibilities/[id]/edit` | Custom role Select + SchemaAccordion children |
| `organizations/[id]/admins/create` | EntityChooserCheckbox, CountrySelect |
| `data-verification-requests/create` | Checkbox matrix, RoleChooser |
| `payment-infos` create/edit + `payment-info-form-fields.tsx` | EntityCombobox |
| `courses/[id]/edit` + `course-program-field-config.tsx` | Program/intake/subject EntitySelect, YearMonth, course_fields |
| `org/record/*` + `organization-profile-sections.ts` | Domain editor, timezone, file upload, gated fields |
| `registration/info-step.tsx` | CountrySelect + dynamic GroupSections |
| `assignment-form.tsx` / `email-templates/template-form.tsx` | TipTap + attachments outside schema |
| `course-history-form.tsx` | CourseSelect |

**Utility-only imports** of `getObjectFormSchema` / `getDefaultValues` — move helpers into `src/components/auto-form/` (or `src/lib/form/`) and update imports; then delete ui/auto-form.

---

### Tasks

- [ ] **Task 1:** Extend `field-map` / `fieldConfig.fieldType` to support existing override components via primitives wrappers (EntityCombobox, CountrySelect, etc.).
- [ ] **Task 2:** Migrate each complex path; prefer hand-compose if config becomes a second language (per spec) — still must drop `ui/auto-form` import.
- [ ] **Task 3:** Move shared helpers off `ui/auto-form.tsx`.
- [ ] **Task 4: Delete legacy**

```bash
rg -n "components/ui/auto-form|from [\"'].*ui/auto-form" src
# Expect only the file being deleted
rm src/components/ui/auto-form.tsx
# delete auto-form-fields-skeleton legacy if fully replaced
```

- [ ] **Task 5:** `tsc` + unit tests; smoke visibilities edit, payment-info edit, course edit, registration step.
- [ ] **Task 6:** PR `migrate(ui): F3 complex auto-form + delete legacy AutoForm`

## Review brief

```
F3: zero ui/auto-form imports; complex overrides work; helpers relocated; tsc green; no shim left behind.
```
