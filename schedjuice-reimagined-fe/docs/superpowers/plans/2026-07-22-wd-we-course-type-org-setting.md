# WD/WE Course Type Org Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reports-and-billing org switch that enables/disables WD/WE terminology by adding/removing `"course_type"` from `Organization.course_fields`.

**Architecture:** Keep `course_fields` as the single source of truth. Expose a virtual Switch on the owner org form that mutates whether `"course_type"` is in that array. Existing `orgUsesWdWeNomenclature` continues to gate scheduling UI; after save, existing `refetchTenant()` already refreshes tenant cookie/state.

**Tech Stack:** Next.js FE, Zod + react-hook-form AutoForm, Vitest, existing org section FormData PATCH (no BE migration).

## Global Constraints

- Storage: virtual switch over `course_fields` only — no new Organization boolean column.
- Off: remove `"course_type"` from `course_fields`; do not clear `Course.course_type` rows.
- On: append `"course_type"` once if missing; preserve other fields and order.
- Null/empty `course_fields` → treat as `[]`; on → save `["course_type"]` (do not invent a full default list).
- Label: `Use WD/WE course types`
- Description: `When on, scheduling uses WD (Mon–Thu) and WE (Sat–Sun) instead of individual weekdays. Friday stays on Custom schedule.`
- Placement: Reports and billing, after `is_fm_hm_course_display_enabled`.
- Tests: high-value helpers + optional section pick; no “switch renders” UI smoke.
- Work in `schedjuice-reimagined-fe` git root.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/helpers/simple-schedule.ts` | `courseFieldsUseWdWe` / `courseFieldsWithWdWe`; keep `orgUsesWdWeNomenclature` as thin alias |
| `src/helpers/simple-schedule.test.ts` | High-value helper tests |
| `src/types/organization.ts` | Stop omitting `course_fields` from `organizationOwnerEditSchema` |
| `src/config/organization-profile-sections.ts` | Add `course_fields` to reports-billing keys |
| `src/components/org/record/use-org-record-form.tsx` | Load `course_fields`; custom Switch `fieldConfig` |
| `src/lib/org/build-org-section-payload.test.ts` | Assert reports-billing picks `course_fields` |

No backend files.

---

### Task 1: `course_fields` WD/WE helpers

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/simple-schedule.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/simple-schedule.test.ts`

**Interfaces:**
- Consumes: existing `orgUsesWdWeNomenclature` call sites (unchanged signatures)
- Produces:
  - `courseFieldsUseWdWe(fields: string[] | null | undefined): boolean`
  - `courseFieldsWithWdWe(fields: string[] | null | undefined, enabled: boolean): string[]`
  - `orgUsesWdWeNomenclature` → delegates to `courseFieldsUseWdWe`

- [ ] **Step 1: Write the failing tests**

Append to `src/helpers/simple-schedule.test.ts` (keep existing `orgUsesWdWeNomenclature` describe; extend imports):

```typescript
import {
  // ...existing imports...
  courseFieldsUseWdWe,
  courseFieldsWithWdWe,
} from "@/helpers/simple-schedule";

describe("courseFieldsUseWdWe", () => {
  it("is true only when course_type is listed", () => {
    expect(courseFieldsUseWdWe(["title", "course_type"])).toBe(true);
    expect(courseFieldsUseWdWe(["title"])).toBe(false);
    expect(courseFieldsUseWdWe(null)).toBe(false);
    expect(courseFieldsUseWdWe(undefined)).toBe(false);
  });
});

describe("courseFieldsWithWdWe", () => {
  it("appends course_type when enabling and missing", () => {
    expect(courseFieldsWithWdWe(["title", "code"], true)).toEqual([
      "title",
      "code",
      "course_type",
    ]);
  });

  it("does not duplicate course_type when already present", () => {
    expect(
      courseFieldsWithWdWe(["title", "course_type", "code"], true),
    ).toEqual(["title", "course_type", "code"]);
  });

  it("removes only course_type when disabling", () => {
    expect(
      courseFieldsWithWdWe(["title", "course_type", "code"], false),
    ).toEqual(["title", "code"]);
  });

  it("treats null/undefined as empty and enables to [course_type]", () => {
    expect(courseFieldsWithWdWe(null, true)).toEqual(["course_type"]);
    expect(courseFieldsWithWdWe(undefined, false)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/simple-schedule.test.ts
```

Expected: FAIL — `courseFieldsUseWdWe` / `courseFieldsWithWdWe` not exported.

- [ ] **Step 3: Implement helpers**

In `src/helpers/simple-schedule.ts`, replace the current `orgUsesWdWeNomenclature` block with:

```typescript
export function courseFieldsUseWdWe(
  courseFields: string[] | null | undefined,
): boolean {
  return Array.isArray(courseFields) && courseFields.includes("course_type");
}

/** Add or remove `course_type` while preserving other entries and order. */
export function courseFieldsWithWdWe(
  courseFields: string[] | null | undefined,
  enabled: boolean,
): string[] {
  const next = Array.isArray(courseFields) ? [...courseFields] : [];
  const idx = next.indexOf("course_type");
  if (enabled) {
    if (idx === -1) next.push("course_type");
    return next;
  }
  if (idx !== -1) next.splice(idx, 1);
  return next;
}

export function orgUsesWdWeNomenclature(
  courseFields: string[] | null | undefined,
): boolean {
  return courseFieldsUseWdWe(courseFields);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/simple-schedule.test.ts
```

Expected: PASS (including existing `orgUsesWdWeNomenclature` tests).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/simple-schedule.ts src/helpers/simple-schedule.test.ts
git commit -m "$(cat <<'EOF'
feat: add course_fields WD/WE toggle helpers

EOF
)"
```

---

### Task 2: Owner schema + reports-billing section key

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization.ts` (`organizationOwnerEditSchema` omit list)
- Modify: `schedjuice-reimagined-fe/src/config/organization-profile-sections.ts` (reports-billing `keys`)
- Modify: `schedjuice-reimagined-fe/src/lib/org/build-org-section-payload.test.ts`

**Interfaces:**
- Consumes: `organizationFieldsSchema.course_fields` already defined
- Produces: `course_fields` editable on owner form schema; included in `pickOrgSectionValues("reports-billing", …)`

- [ ] **Step 1: Write the failing section-pick test**

Append to `src/lib/org/build-org-section-payload.test.ts`:

```typescript
  it("includes course_fields in reports-billing", () => {
    const all = {
      report_style: "default",
      is_fm_hm_course_display_enabled: true,
      course_fields: ["title", "course_type"],
      timezone: "Asia/Yangon",
    };
    const picked = pickOrgSectionValues("reports-billing", all);
    expect(picked.course_fields).toEqual(["title", "course_type"]);
    expect(picked).toHaveProperty("is_fm_hm_course_display_enabled", true);
    expect(picked).not.toHaveProperty("timezone");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/lib/org/build-org-section-payload.test.ts
```

Expected: FAIL — `picked.course_fields` undefined (key not in section).

- [ ] **Step 3: Include `course_fields` on owner schema and section**

In `src/types/organization.ts`, remove `course_fields: true` from the `organizationOwnerEditSchema.omit({ ... })` list so `course_fields` remains on the owner edit schema.

In `src/config/organization-profile-sections.ts`, update the reports-billing section keys so `course_fields` sits immediately after `is_fm_hm_course_display_enabled`:

```typescript
  {
    id: "reports-billing",
    title: "Reports and billing",
    description: "Reporting style, screenshots, and invoice generation.",
    keys: [
      "report_style",
      "course_sheet_template",
      "transaction_screenshot_strategy",
      "is_fm_hm_course_display_enabled",
      "course_fields",
      "is_payment_plan_mandatory",
      "is_legacy_discount_visible",
      "invoice_generation_strategy",
      "invoice_generation_interval_days",
    ],
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/lib/org/build-org-section-payload.test.ts
```

Expected: PASS.

Also confirm the owner-schema / section key sync check does not warn for `course_fields` (dev-only `console.error` in `organization-profile-sections.ts` when schema keys and section keys diverge).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/types/organization.ts src/config/organization-profile-sections.ts src/lib/org/build-org-section-payload.test.ts
git commit -m "$(cat <<'EOF'
feat: expose course_fields on org reports-billing section

EOF
)"
```

---

### Task 3: Org form load + WD/WE Switch fieldConfig

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx`

**Interfaces:**
- Consumes: `courseFieldsUseWdWe`, `courseFieldsWithWdWe` from Task 1
- Produces: Reports-and-billing Switch that reads/writes `course_fields`; save path already JSON-stringifies arrays and calls `refetchTenant()` on success

- [ ] **Step 1: Load `course_fields` into the form**

In `use-org-record-form.tsx` hydrate effect, change:

```typescript
if (writeOnly.has(k) || k === "course_fields") return;
```

to:

```typescript
if (writeOnly.has(k)) return;
```

When setting values, normalize null `course_fields` to `[]`:

```typescript
        if (k === "course_fields") {
          form.setValue(
            k,
            Array.isArray(value) ? value : [],
          );
          return;
        }
```

(Keep the existing `id_card_*` special cases; place the `course_fields` branch alongside them.)

- [ ] **Step 2: Add imports**

At top of `use-org-record-form.tsx`, add:

```typescript
import { Switch } from "@/components/primitives";
import {
  courseFieldsUseWdWe,
  courseFieldsWithWdWe,
} from "@/helpers/simple-schedule";
```

(`Field` is already imported from primitives; extend that import to include `Switch` if preferred over a second import.)

- [ ] **Step 3: Add `course_fields` fieldConfig Switch**

Inside `useOrgFieldConfig`’s `fieldConfig` object (near other reports-billing descriptions is fine), add:

```typescript
      course_fields: {
        customLabel: "Use WD/WE course types",
        description:
          "When on, scheduling uses WD (Mon–Thu) and WE (Sat–Sun) instead of individual weekdays. Friday stays on Custom schedule.",
        fieldType: (props: AutoFormInputComponentProps) => {
          const enabled = courseFieldsUseWdWe(
            props.field.value as string[] | null | undefined,
          );
          return (
            <Field.Root
              className="flex-row items-center justify-between gap-3"
              name={props.field.name}
              invalid={Boolean(props.error)}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Field.Label>{props.label}</Field.Label>
                {props.fieldConfigItem.description ? (
                  <Field.Description>
                    {props.fieldConfigItem.description}
                  </Field.Description>
                ) : null}
                <div className="min-h-5">
                  {props.error ? (
                    <Field.Error>{props.error}</Field.Error>
                  ) : null}
                </div>
              </div>
              <Switch
                className="shrink-0"
                name={props.field.name}
                checked={enabled}
                onCheckedChange={(checked) => {
                  props.field.onChange(
                    courseFieldsWithWdWe(
                      props.field.value as string[] | null | undefined,
                      checked === true,
                    ),
                  );
                  props.field.onBlur();
                }}
                onBlur={props.field.onBlur}
              />
            </Field.Root>
          );
        },
      },
```

Do **not** add a happy-path render test.

- [ ] **Step 4: Manual verification**

1. Open org settings → Reports and billing.
2. Confirm switch label/description and placement under FM/HM.
3. Toggle on → Save → confirm tenant `course_fields` includes `course_type` (scheduling shows WD/WE).
4. Toggle off → Save → `course_type` removed; other fields preserved; scheduling shows weekday chips.
5. Org with null/empty `course_fields`: switch off; turn on + save → `["course_type"]` only.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/org/record/use-org-record-form.tsx
git commit -m "$(cat <<'EOF'
feat: add WD/WE course type switch on org settings

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Virtual switch over `course_fields` | 1–3 |
| On append / off remove / no dupes / null→`[]` | 1 |
| Owner schema includes `course_fields` | 2 |
| Reports and billing placement after FM/HM | 2 |
| Load form value (stop skipping) | 3 |
| Custom Switch + copy | 3 |
| Save via existing section FormData + `refetchTenant` | 3 (existing path; no new code) |
| Helper + section-pick tests; no UI smoke | 1–2 |
| No BE boolean / no Course.course_type migration | — out of scope, no tasks |

## Self-review notes

- No placeholders.
- Helper names match across tasks (`courseFieldsUseWdWe` / `courseFieldsWithWdWe`).
- After-save refresh is already in `updateOrganization.onSuccess` via `refetchTenant()` when editing the current tenant — Task 3 documents verification, does not duplicate that logic.
