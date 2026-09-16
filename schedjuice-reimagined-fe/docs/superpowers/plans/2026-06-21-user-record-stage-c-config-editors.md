# User Record P2b — Stage C: Config Groups, Operational Editors & Edit-Page Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Finish the inline record: make the **config-driven groups** (Personal/Medical/Documents/Emergency) and **operational sections** (check-in, payroll, HR, Zoom) and **public profile** editable in place, then **remove `/users/[id]/edit`** entirely (repointing links + relocating delete/resign into the identity-strip `⋯` menu).

**Architecture:** A new `InlineGroup` renders one config group read-only by default and flips to an editable form on demand — reusing the existing `GroupSection` (which already honors `field-policy` actor/required/read-only and address clustering), `buildConfigSchema` for validation, and the existing custom_data payload builder. Group-level **explicit Save/Cancel** matches today's "Save custom fields" model and the spec's "grouped fields → explicit save". Operational sections reuse the existing RHF field components in the same inline-group wrapper. Public profile reuses `UserPublicProfileFields`. Resign/Delete are rebuilt on Base UI in the `⋯` menu. Then `/edit` is deleted.

**Tech Stack:** react-hook-form + zod (`buildConfigSchema`), `GroupSection` + `FieldRenderer` + `field-policy` (`@/lib/custom-fields/*`), `useAutosaveForm` core concepts (optimistic cache) but **explicit** group saves via `updateEntity`, Base UI primitives, `motion/react` + `src/lib/sj/motion.ts`.

**Spec:** `docs/superpowers/specs/2026-06-21-user-record-inline-design.md` (Stage C = §10 stage 3).

**Predecessors:** Stage A (shell/swap/sections), Stage B (Overview inline Profile + Roles + Connections + `InlineField`/undo). This stage assumes `RecordOverview`, `recordQueryKey`, the `?section=` rail, and the `⋯` menu exist.

---

## Scope notes (read first)

- **Group → section mapping:** config groups are tenant-defined; we can't reliably classify "Personal" vs "Medical" by id. **Default:** render **all config groups in the Records section** (inline), plus operational HR/check-in/Zoom; **Finance** gets payroll; **Academic** gets the teacher public profile. (Open item: a future refinement can map specific group ids to Overview vs Records.)
- **Commit mode for groups:** group-level **explicit Save/Cancel** (not per-field auto-save). This matches the existing "Save custom fields" behavior and the spec's grouped/cross-field rule, and keeps medical/notes textareas explicit. Per-field auto-save inside groups is a possible later refinement.
- **Access control:** edit-mode hides/locks fields via `isFieldReadOnly(field, actor)`; read-mode redaction continues via `getExcludedColumns`. A fully-redacted group is omitted; a partially-gated group shows the "HR & Admin only" indicator.

---

## File Structure

**Create:**
- `src/components/record/inline/inline-group.tsx` — read↔edit a config group (reuses `GroupSection`), explicit Save/Cancel, group validation, optimistic save
- `src/components/record/inline/config-payload.ts` — pure: build the custom_data/builtin diff for a group's dirty fields
- `src/components/record/inline/config-payload.test.ts` — tests
- `src/components/record/sections/record-records.tsx` — config groups (InlineGroup) + HR + check-in + Zoom
- `src/components/record/sections/record-finance.tsx` — payroll (inline) + payment info (reuse display)
- `src/components/record/sections/record-academic.tsx` — moves the Stage-A academic displays here + teacher public profile (inline)
- `src/components/record/resign-dialog.tsx` — new-design resign flow (replaces shadcn `UserResignDialog` usage in the record)

**Modify:**
- `src/components/record/record-actions-menu.tsx` — add Mark-as-resigned + Delete (deferred from Stage A)
- `src/app/(internal)/users/[id]/page.tsx` — render `RecordRecords`/`RecordFinance`/`RecordAcademic`; drop the read-only `FormConfigDetail` from Overview (moves into Records as editable)
- `src/components/record/sections/record-overview.tsx` — remove the read-only config-groups block (now in Records)

**Delete (route removal):**
- `src/app/(internal)/users/[id]/edit/**` (page, `user-edit-form-inner.tsx`, `loading.tsx`; verify `assign-courses` sub-route handling)

**Reuse:** `GroupSection`, `FieldRenderer`, `buildConfigSchema`, `field-policy`, `getExcludedColumns`, `UserPublicProfileFields`, `DeleteZone` logic, `resignUser` API, existing operational field components in `user-form-fields.tsx`.

---

## Task 1: Config payload builder (TDD)

**Files:** Create `src/components/record/inline/config-payload.ts`, `config-payload.test.ts`

A group's fields bind to RHF paths via `fieldFormPath` — builtin → `key`, custom → `custom_data.key`. Saving must produce a nested `{ custom_data: {...}, <builtinKey>: ... }` diff for `updateEntity`. This shaping is pure and worth testing.

> First check for an existing builder: `grep -rn "collectGroupPayload\|collectConfigPayload" src`. If one exists in `src/components/users/user-form-utils.ts`, **reuse it** and skip creating a new one (still add a thin test if untested). Otherwise implement below.

- [ ] **Step 1: Write failing tests**

`src/components/record/inline/config-payload.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildGroupPayload } from "./config-payload";

describe("buildGroupPayload", () => {
  it("nests custom_data fields and keeps builtin fields flat", () => {
    const values = {
      name: "X",
      phone_number: "1",
      "custom_data.blood_type": "O+",
      "custom_data.allergies": "none",
    };
    const out = buildGroupPayload(values, ["phone_number", "custom_data.blood_type"]);
    expect(out).toEqual({
      phone_number: "1",
      custom_data: { blood_type: "O+" },
    });
  });
  it("returns {} for no fields", () => {
    expect(buildGroupPayload({ a: 1 }, [])).toEqual({});
  });
  it("merges multiple custom_data keys", () => {
    const out = buildGroupPayload(
      { "custom_data.a": 1, "custom_data.b": 2 },
      ["custom_data.a", "custom_data.b"],
    );
    expect(out).toEqual({ custom_data: { a: 1, b: 2 } });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm run test:unit -- --run src/components/record/inline/config-payload.test.ts`)

- [ ] **Step 3: Implement**

`src/components/record/inline/config-payload.ts`:
```ts
/** Build an updateEntity diff for the given RHF paths, nesting custom_data.* keys. */
export function buildGroupPayload(
  values: Record<string, unknown>,
  paths: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const p of paths) {
    if (p.startsWith("custom_data.")) {
      custom[p.slice("custom_data.".length)] = values[p];
    } else {
      out[p] = values[p];
    }
  }
  if (Object.keys(custom).length > 0) out.custom_data = custom;
  return out;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**
```bash
git add src/components/record/inline/config-payload.ts src/components/record/inline/config-payload.test.ts
git commit -m "feat(record): config group payload builder (TDD)"
```

---

## Task 2: InlineGroup primitive

**Files:** Create `src/components/record/inline/inline-group.tsx`

Read-only by default (reuse `FormConfigDetail` for a single group, or a compact read renderer); "Edit" flips to a RHF form rendering `GroupSection`, with explicit Save/Cancel, `buildConfigSchema` validation, optimistic cache write, and `field-policy` actor.

- [ ] **Step 1: Implement**

`src/components/record/inline/inline-group.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EditPencil } from "iconoir-react";
import { GroupSection } from "@/components/custom-fields/group-section";
import { FormConfigDetail } from "@/components/custom-fields/form-config-detail";
import { buildConfigSchema } from "@/lib/custom-fields/build-config-schema";
import { fieldFormPath, type FormActor } from "@/lib/custom-fields/field-policy";
import { Button } from "@/components/primitives/button";
import { Form } from "@/components/ui/form"; // RHF context provider used by FieldRenderer
import { updateEntity } from "@/app/client-api/utils";
import { useToast } from "@/components/ui/use-toast";
import { buildGroupPayload } from "./config-payload";
import type { FormConfig, FormConfigGroup } from "@/types/form-config";
import { cn } from "@/lib/utils";

export function InlineGroup({
  group, subject, actor, recordQueryKey, redactedKeys, canEdit,
}: {
  group: FormConfigGroup;
  subject: Record<string, unknown> & { id: number };
  actor: FormActor;
  recordQueryKey: unknown[];
  redactedKeys: string[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const paths = useMemo(() => group.fields.map(fieldFormPath), [group]);

  const defaultValues = useMemo(() => {
    const v: Record<string, unknown> = {};
    for (const f of group.fields) {
      const p = fieldFormPath(f);
      v[p] = p.startsWith("custom_data.")
        ? ((subject.custom_data as Record<string, unknown> | undefined) ?? {})[
            p.slice("custom_data.".length)
          ]
        : subject[p];
    }
    return v;
  }, [group, subject]);

  // Single-group config so buildConfigSchema validates only these fields.
  const singleGroupConfig: FormConfig = useMemo(
    () => ({ groups: [group] }) as FormConfig,
    [group],
  );
  const schema = useMemo(
    () => buildConfigSchema({}, singleGroupConfig, "edit"),
    [singleGroupConfig],
  );

  const form = useForm({ resolver: zodResolver(schema), defaultValues, mode: "onBlur" });

  const save = useMutation({
    mutationFn: () =>
      updateEntity("users", String(subject.id), buildGroupPayload(form.getValues(), paths)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordQueryKey });
      toast({ title: `${group.name} saved` });
      setEditing(false);
    },
    onError: () => toast({ variant: "destructive", title: `Could not save ${group.name}` }),
  });

  if (!editing) {
    return (
      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-serif text-lg text-text-primary">{group.name}</p>
          {canEdit ? (
            <button
              type="button"
              onClick={() => { form.reset(defaultValues); setEditing(true); }}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
            >
              <EditPencil width={13} height={13} aria-hidden /> Edit
            </button>
          ) : null}
        </div>
        <FormConfigDetail
          config={singleGroupConfig}
          source={subject}
          isLoading={false}
          redactedKeys={redactedKeys}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-strong bg-surface-elevated p-4">
      <p className="mb-3 font-serif text-lg text-text-primary">{group.name}</p>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(() => save.mutate())}
          className={cn("flex flex-col gap-4")}
        >
          <GroupSection form={form} group={group} surface="edit" actor={actor} />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={save.isLoading}>Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
```

> Verify: `buildConfigSchema(base, config, surface)` signature + that passing a single-group `FormConfig` is valid; `FormConfig`/`FormConfigGroup` shape (does it have `{ groups }`?); `FormConfigDetail` accepts a single-group config; `save.isLoading` vs `isPending` (TanStack v4 uses `isLoading`). `Form` from `@/components/ui/form` is the RHF provider `FieldRenderer` expects (it uses `FormField`/`FormItem` which need the shadcn `Form` context) — confirm wrapping in `<Form {...form}>` supplies it. Edit mode is shadcn-styled (FieldRenderer/GroupSection are shadcn) inside the cream card — acceptable hybrid for Stage C; full primitive rebuild of FieldRenderer is out of scope.

- [ ] **Step 2: Build** — `npm run build`. Expected: compiles.

- [ ] **Step 3: Commit**
```bash
git add src/components/record/inline/inline-group.tsx
git commit -m "feat(record): InlineGroup config editor (read/edit, explicit save)"
```

---

## Task 3: Records section (config groups + HR + check-in + Zoom)

**Files:** Create `src/components/record/sections/record-records.tsx`

- [ ] **Step 1: Implement**

Render each config group as an `InlineGroup`; below, the operational HR / check-in / Zoom editors. For the operational ones (hardcoded builtin keys, see `OPERATIONAL_SECTIONS` in `build-form-sections.ts`), reuse the existing RHF field components from `src/components/users/user-form-fields.tsx` inside an explicit-save wrapper analogous to `InlineGroup` (a `<Form>` + the field component + Save/Cancel + `updateEntity` with the builtin keys). 

```tsx
"use client";
import { InlineGroup } from "@/components/record/inline/inline-group";
import { getExcludedColumns } from "@/helpers/visibility";
import { accountVisibilitySchema, type accountType } from "@/types/user";
import type { FormConfig } from "@/types/form-config";
import type { FormActor } from "@/lib/custom-fields/field-policy";
import type { organizationType } from "@/types/organization";

export function RecordRecords({
  subject, viewer, tenant, recordQueryKey, detailConfig,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  recordQueryKey: unknown[];
  detailConfig: FormConfig | undefined;
}) {
  const actor: FormActor =
    viewer.email && subject.email && viewer.email === subject.email ? "user" : "admin";
  const redactedKeys = getExcludedColumns(viewer, accountVisibilitySchema, "user");
  const canEdit = actor === "admin"; // refine per group/permission if needed
  const groups = detailConfig?.groups ?? [];

  return (
    <div className="sj-root flex flex-col gap-4">
      {groups.map((g) => (
        <InlineGroup
          key={g.id ?? g.name}
          group={g}
          subject={subject as unknown as Record<string, unknown> & { id: number }}
          actor={actor}
          recordQueryKey={recordQueryKey}
          redactedKeys={redactedKeys}
          canEdit={canEdit}
        />
      ))}
      {/* TODO(impl): HR / check-in / Zoom operational editors reusing user-form-fields components
          inside an explicit-save wrapper. Gate each by its tenant flag + availableKeys, as
          build-form-sections.ts does (OPERATIONAL_SECTIONS). */}
    </div>
  );
}
```

> Implement the operational editors in this task (not a placeholder in the shipped code): build a small `InlineBuiltinGroup` wrapper (mirror of `InlineGroup` but rendering a given set of builtin fields via the existing `CheckinFields`/`PayrollFields`/`HrFields`/`ZoomFields` components from `user-form-fields.tsx`). Verify those components' exact exports/props (`grep -n "export" src/components/users/user-form-fields.tsx`); if they're not separately exported, extract them or render the relevant `FieldRenderer`-equivalent inputs directly. Gate by the same tenant flags the edit page used.

- [ ] **Step 2: Build + dev verify** a config group edits + saves (custom_data persists on reload); redacted fields hidden for a non-privileged viewer; read-only fields locked for self-edit (`actor === "user"`).

- [ ] **Step 3: Commit**
```bash
git add src/components/record/sections/record-records.tsx src/components/record/inline
git commit -m "feat(record): Records section with inline config + operational editors"
```

---

## Task 4: Finance + Academic sections

**Files:** Create `src/components/record/sections/record-finance.tsx`, `record-academic.tsx`; Modify `page.tsx`

- [ ] **Step 1: Finance** — payroll inline (the `payroll` operational group via the Task-3 `InlineBuiltinGroup`, gated by `is_payroll_calculation_enabled` + permission) + payment info (reuse the existing `UserPaymentInfoTab` display).

- [ ] **Step 2: Academic** — move the Stage-A academic JSX (Courses `DataTable`, `UserCalendar`, `CourseHistory`, `UserProfileAssessments`) into `record-academic.tsx` verbatim, and add the teacher **public profile** editor reusing `UserPublicProfileFields` (it already has its own explicit "Save public profile"); show only when `subjectIsTeacher`.

> Moving the academic block out of `page.tsx` reduces the page to a thin section switcher. Carry the queries/props verbatim (they currently live in `page.tsx`); pass what they need as props or lift the relevant queries into the section. If lifting is risky, keep those queries in `page.tsx` and pass results down.

- [ ] **Step 3: Wire page** — `page.tsx` renders `<RecordRecords/>`, `<RecordFinance/>`, `<RecordAcademic/>` for their sections; remove the now-duplicated inline JSX and the read-only `FormConfigDetail` from `RecordOverview` (config groups now live in Records).

- [ ] **Step 4: Build + dev verify** all four sections; teacher public profile saves; payroll gated correctly.

- [ ] **Step 5: Commit**
```bash
git add src/components/record/sections "src/app/(internal)/users/[id]/page.tsx"
git commit -m "feat(record): Finance + Academic sections (inline payroll, public profile, displays)"
```

---

## Task 5: Resign + Delete in the ⋯ menu

**Files:** Create `src/components/record/resign-dialog.tsx`; Modify `src/components/record/record-actions-menu.tsx`

- [ ] **Step 1: Resign dialog (new design)** — rebuild the resign form (inform date, last working date [required], type of pay, employment type, remark) on Base UI primitives (`Dialog`, `Select`, `Input`, `Textarea` equivalents) calling the existing `resignUser` API (`@/app/client-api/auth`, `UserResignPayload`). Controlled `open`/`onOpenChange` so the `⋯` menu can open it.

- [ ] **Step 2: Add to the menu** — in `record-actions-menu.tsx`, add "Mark as resigned" (opens the new dialog; gated as before: admin, active, non-student-only, not already resigned) and "Delete user" (confirm `AlertDialog` → reuse `DeleteZone`'s delete call / the users delete endpoint; gated by `canDeleteUser`). On success, navigate to `/users` for delete; invalidate `recordQueryKey` for resign.

- [ ] **Step 3: Build + dev verify** resign + delete flows from `⋯`.

- [ ] **Step 4: Commit**
```bash
git add src/components/record/resign-dialog.tsx src/components/record/record-actions-menu.tsx
git commit -m "feat(record): resign + delete actions in the identity-strip menu"
```

---

## Task 6: Remove the `/edit` route

**Files:** Delete `src/app/(internal)/users/[id]/edit/**`; Modify any linkers

- [ ] **Step 1: Find all references**

Run: `grep -rn "users/.*\\/edit\|/edit\"\|editHref\|\\[id\\]/edit" src --include=*.tsx --include=*.ts`
Inventory every link/route that targets the user edit page (masthead was already replaced in Stage A; check nav, deep links, `assign-courses` parent, breadcrumbs, `route-permissions.ts`, `middleware.ts`).

- [ ] **Step 2: Repoint or remove** each reference. Links that pointed to `/users/[id]/edit` now point to `/users/[id]` (optionally `?section=...`). Decide `assign-courses` (`/users/[id]/edit/assign-courses`): either move to `/users/[id]/assign-courses` or surface as an Academic action — pick one and update its links.

- [ ] **Step 3: Delete the route**

Delete `src/app/(internal)/users/[id]/edit/page.tsx`, `user-edit-form-inner.tsx`, `loading.tsx` (and the `edit` folder if empty after handling `assign-courses`).

- [ ] **Step 4: Build + grep clean** — `npm run build`; `grep -rn "\\[id\\]/edit" src` returns nothing (except intentionally-moved `assign-courses`).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "chore(record): remove /users/[id]/edit; fold editing into the record"
```

---

## Task 7: Validation gate

- [ ] **Step 1: Behavior** — every field formerly editable on `/edit` is editable inline in its section (config groups, payroll, HR, check-in, Zoom, public profile); group Save persists + reloads correctly; Cancel discards; validation inline; read-only/redaction honored for self vs admin and per visibility; resign/delete/disable/welcome all work from `⋯`; `/edit` is gone with no dead links.
- [ ] **Step 2: Personas** — verify as a non-privileged viewer (redacted Medical hidden), as self (admin-filled fields locked), and as admin (full edit).
- [ ] **Step 3: Regressions** — Stage A swap + Stage B Overview inline still work; identity strip stays in sync after group saves (same `recordQueryKey`).
- [ ] **Step 4: Gate** — `npm run lint`; `npx tsc --noEmit` then grep `components/record`/`users/[id]`; `npm run test:unit -- --run` (config-payload + undo-core + existing pass). Note: the pre-existing unrelated `bulk-add-members` type error may still block a full `npm run build` until separately fixed.
- [ ] **Step 5: Commit** any fixes.

---

## Self-Review (plan author)

**Spec coverage (Stage C):** config groups inline (field-policy + visibility + validation) → Tasks 1–3; payroll/HR/check-in/Zoom → Tasks 3–4; public profile → Task 4; remove `/edit` + relocate connectors(done B)/delete/resign → Tasks 5–6; access control → Tasks 2–3, 7. Matches spec §10 stage 3 and §2 goal 3/4.

**Type consistency:** `buildGroupPayload(values, paths)` (Task 1) used in `InlineGroup` (Task 2). `InlineGroup` props used by `RecordRecords` (Task 3). `FormActor` derivation (`user` vs `admin`) consistent with `field-policy.isFieldReadOnly`. `recordQueryKey` threaded from page → sections → InlineGroup/mutations (consistent cache, same key as Stages A/B). `fieldFormPath` used for both defaults and payload paths (same mapping ⇒ round-trips correctly).

**Flagged to verify against source (concrete, not placeholders):** existing `collectGroupPayload` in `user-form-utils.ts` (reuse if present); `buildConfigSchema` signature + single-group usage; `FormConfig`/`FormConfigGroup` shape (`{ groups }`, `group.id`/`group.fields`); `FormConfigDetail` single-group rendering; `Form` provider requirement for `FieldRenderer`; TanStack v4 `isLoading` vs `isPending`; operational field component exports in `user-form-fields.tsx`; `resignUser`/`UserResignPayload` + delete endpoint; `assign-courses` relocation; all `/edit` link sites.

**Size caveat:** Stage C is large. Tasks are independently shippable — execute in batches (e.g. 1–3 config core, then 4, then 5–6) with review between, rather than one sitting.

---

## Execution Handoff

Plan complete and saved. This completes the P2b pilot (Stages A→C). Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between.
2. **Inline Execution** — execute here with checkpoints.
