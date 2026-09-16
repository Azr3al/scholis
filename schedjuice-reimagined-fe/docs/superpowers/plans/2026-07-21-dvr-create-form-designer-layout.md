# DVR Create Form-Designer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Create Data Verification Request into a designer-style shell (sticky meta + live preview + right field catalog) while sharing one polished `DvrVerifyForm` for preview and recipient verify.

**Architecture:** Extract `DvrFieldCatalog` for Include/Required toggles. Extend `DvrVerifyForm` with `mode: "verify" | "preview"` and unify builtin-only + custom onto one non-`GenericForm` render path so preview never PATCHes. Rewrite create page as a wide 2-column shell that posts via `makePostRequest` (drop create-page `GenericForm`).

**Tech Stack:** Next.js client components, React Hook Form, Vitest + Testing Library, existing primitives (`Checkbox`, `Field`, `Button`, `RoleChooser`), `useFieldDefinitions` / `useFormConfig`, `makePostRequest`.

**Spec:** `docs/superpowers/specs/2026-07-21-dvr-create-form-designer-layout-design.md`

## Global Constraints

- FE-only; no backend API or `fields[]` shape changes.
- Include/Required stay in the right catalog only (not on preview rows).
- Catalog is always visible (desktop column; mobile stack). No Sheet picker.
- Preview = `DvrVerifyForm` `mode="preview"` (same widgets as verify; no network write; no recipient Submit).
- Medium verify UX polish on the shared form only (no wizard / progress / deep success redesign).
- Defaults and validation unchanged: ≥1 field, ≥1 role, expiry required; built-ins + active customs defaults per `2026-07-21-dvr-custom-fields-design.md`.
- High-value tests only (no happy-path-only smoke).
- FE unit tests: `pnpm test:unit -- <path>` from `schedjuice-reimagined-fe`.
- Do not wire DVR create through form-designer CRUD / DnD / field editor Sheet.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/dvr/dvr-field-catalog.tsx` | Create | Include/Required catalog UI (built-ins + customs) |
| `src/components/dvr/dvr-field-catalog.test.tsx` | Create | Toggle include/required behavior |
| `src/helpers/dvr.ts` | Modify | Export `DVR_PREVIEW_STUB_USER` (minimal `accountType` stub) |
| `src/helpers/dvr.test.ts` | Modify | Stub has expected id/roles shape |
| `src/components/dvr/dvr-verify-form.tsx` | Modify | `mode`, preview/empty/chrome polish; unify render path; no PATCH in preview |
| `src/components/dvr/dvr-verify-form.test.tsx` | Create | Preview empty, include visibility, no mutation, verify required error |
| `src/components/dvr/dvr-create-designer.tsx` | Create | Sticky header/footer + 2-col layout + submit mutation |
| `src/app/(internal)/data-verification-requests/create/page.tsx` | Modify | Thin page wrapping `DvrCreateDesigner` |
| `src/app/(internal)/data-verification-requests/[id]/verify/page.tsx` | Modify | Pass title/helper into shared form chrome; keep enrollment/status logic |

---

### Task 1: Extract `DvrFieldCatalog`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/dvr/dvr-field-catalog.tsx`
- Create: `schedjuice-reimagined-fe/src/components/dvr/dvr-field-catalog.test.tsx`
- Modify later tasks will delete duplicate markup from create page

**Interfaces:**
- Consumes: `DvrFieldConfig` from `@/helpers/dvr`; `CustomFieldDefinitionDto`; `DVR_BUILTIN_FIELD_NAMES`
- Produces:
  ```ts
  export type DvrFieldCatalogProps = {
    selectedFields: DvrFieldConfig[];
    setSelectedFields: Dispatch<SetStateAction<DvrFieldConfig[]>>;
    customDefs: CustomFieldDefinitionDto[];
    defsLoading: boolean;
    defsError: boolean;
    className?: string;
  };
  export function DvrFieldCatalog(props: DvrFieldCatalogProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing catalog tests**

Create `src/components/dvr/dvr-field-catalog.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DvrFieldCatalog } from "./dvr-field-catalog";
import type { DvrFieldConfig } from "@/helpers/dvr";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";

function Harness({ initial }: { initial: DvrFieldConfig[] }) {
  const [selectedFields, setSelectedFields] = useState(initial);
  return (
    <>
      <DvrFieldCatalog
        selectedFields={selectedFields}
        setSelectedFields={setSelectedFields}
        customDefs={
          [
            {
              field_key: "t_shirt_size",
              field_label: "T-Shirt Size",
              source: "custom",
              is_active: true,
            },
          ] as CustomFieldDefinitionDto[]
        }
        defsLoading={false}
        defsError={false}
      />
      <pre data-testid="selection">{JSON.stringify(selectedFields)}</pre>
    </>
  );
}

describe("DvrFieldCatalog", () => {
  it("removes a field from selection when Include is unchecked", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { name: "phone_number", required: false },
          { name: "t_shirt_size", required: false },
        ]}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /^phone number$/i }));
    const selection = JSON.parse(
      screen.getByTestId("selection").textContent || "[]",
    ) as DvrFieldConfig[];
    expect(selection.find((f) => f.name === "phone_number")).toBeUndefined();
    expect(selection.find((f) => f.name === "t_shirt_size")).toBeTruthy();
  });

  it("toggles Required without removing the field", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[{ name: "phone_number", required: false }]} />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: /^required$/i }),
    );
    const selection = JSON.parse(
      screen.getByTestId("selection").textContent || "[]",
    ) as DvrFieldConfig[];
    expect(selection).toEqual([{ name: "phone_number", required: true }]);
  });
});
```

If multiple Required checkboxes appear, scope with `document.getElementById("phone_number-required")` and click that element instead.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/components/dvr/dvr-field-catalog.test.tsx
```

Expected: FAIL (module not found / `DvrFieldCatalog` undefined).

- [ ] **Step 3: Implement `DvrFieldCatalog`**

Create `src/components/dvr/dvr-field-catalog.tsx` by moving `DvrFieldRow` + fields block from `create/page.tsx` (approx lines 67-177). Public API as above. Keep Include checkbox id = `fieldKey`, Required id = `${fieldKey}-required`. Preserve exact toggle handlers from the current create page (do not change selection semantics).

Structure sketch:

```tsx
"use client";

import { Checkbox, Field, Skeleton } from "@/components/primitives";
import {
  DVR_BUILTIN_FIELD_NAMES,
  type DvrFieldConfig,
} from "@/helpers/dvr";
import { cn } from "@/lib/utils";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import type { Dispatch, SetStateAction } from "react";

export type DvrFieldCatalogProps = {
  selectedFields: DvrFieldConfig[];
  setSelectedFields: Dispatch<SetStateAction<DvrFieldConfig[]>>;
  customDefs: CustomFieldDefinitionDto[];
  defsLoading: boolean;
  defsError: boolean;
  className?: string;
};

export function DvrFieldCatalog(props: DvrFieldCatalogProps) {
  // Render Fields * label, builtin rows, Custom fields block
  // (loading skeleton, error text, rows, empty copy) — same as create page today
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/components/dvr/dvr-field-catalog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/dvr/dvr-field-catalog.tsx src/components/dvr/dvr-field-catalog.test.tsx
git commit -m "$(cat <<'EOF'
feat(fe): extract DVR field catalog for create designer

EOF
)"
```

---

### Task 2: Preview stub + `DvrVerifyForm` mode (unify render path)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/dvr.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/dvr.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/dvr/dvr-verify-form.tsx`
- Create: `schedjuice-reimagined-fe/src/components/dvr/dvr-verify-form.test.tsx`

**Interfaces:**
- Consumes: existing `resolveDvrVerifyFields`, `useFieldDefinitions`, `useFormConfig`
- Produces:
  ```ts
  // helpers/dvr.ts
  export const DVR_PREVIEW_STUB_USER: accountType; // id: 0, roles include "teacher"

  // dvr-verify-form.tsx
  export type DvrVerifyFormMode = "verify" | "preview";
  export type DvrVerifyFormProps = {
    mode?: DvrVerifyFormMode; // default "verify"
    user: accountType;
    dvrId?: number; // required when mode === "verify"
    rawFields: unknown;
    onVerified?: () => void; // required when mode === "verify"
    isVerifying?: boolean;
    title?: string;
    description?: string;
  };
  ```

- [ ] **Step 1: Write failing helper + form tests**

Append to `src/helpers/dvr.test.ts`:

```ts
import { DVR_PREVIEW_STUB_USER } from "./dvr";

describe("DVR_PREVIEW_STUB_USER", () => {
  it("is a non-persisted stub with staff-ish roles", () => {
    expect(DVR_PREVIEW_STUB_USER.id).toBe(0);
    expect(DVR_PREVIEW_STUB_USER.roles).toContain("teacher");
  });
});
```

Create `src/components/dvr/dvr-verify-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DvrVerifyForm } from "./dvr-verify-form";
import { DVR_PREVIEW_STUB_USER } from "@/helpers/dvr";

const updateEntity = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  updateEntity: (...args: unknown[]) => updateEntity(...args),
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/use-form-config", () => ({
  useFormConfig: () => ({ data: { groups: [] }, isLoading: false }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("DvrVerifyForm preview mode", () => {
  beforeEach(() => {
    updateEntity.mockReset();
  });

  it("shows empty guidance when no fields are included", async () => {
    render(
      wrap(
        <DvrVerifyForm
          mode="preview"
          user={DVR_PREVIEW_STUB_USER}
          rawFields={[]}
          title="Preview"
        />,
      ),
    );
    expect(
      await screen.findByText(/select at least one field/i),
    ).toBeTruthy();
  });

  it("does not call updateEntity on interaction", async () => {
    render(
      wrap(
        <DvrVerifyForm
          mode="preview"
          user={DVR_PREVIEW_STUB_USER}
          rawFields={[{ name: "phone_number", required: false }]}
          title="Preview"
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: /^submit$/i })).toBeNull();
    const phone = await screen.findByLabelText(/phone/i);
    await userEvent.type(phone, "09123456789{Enter}");
    expect(updateEntity).not.toHaveBeenCalled();
  });
});

describe("DvrVerifyForm verify mode", () => {
  it("rejects missing required fields without calling updateEntity", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <DvrVerifyForm
          mode="verify"
          user={DVR_PREVIEW_STUB_USER}
          dvrId={9}
          rawFields={[{ name: "phone_number", required: true }]}
          onVerified={vi.fn()}
        />,
      ),
    );
    await user.click(await screen.findByRole("button", { name: /^submit$/i }));
    await waitFor(() => {
      expect(updateEntity).not.toHaveBeenCalled();
    });
    expect(screen.getByText(/required|phone/i)).toBeTruthy();
  });
});
```

Tune label queries to match AutoForm labels (`Phone number` from schema describe).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/helpers/dvr.test.ts src/components/dvr/dvr-verify-form.test.tsx
```

Expected: FAIL on missing export / missing preview empty copy / Submit still present in preview.

- [ ] **Step 3: Implement stub + form mode**

In `helpers/dvr.ts`, add:

```ts
import type { accountType } from "@/types/user";

export const DVR_PREVIEW_STUB_USER = {
  id: 0,
  email: "preview@example.com",
  communication_email: "",
  name: "",
  password: "",
  roles: ["teacher"],
  phone_number: "",
  is_password_change_required: false,
  custom_data: {},
} as accountType;
```

In `dvr-verify-form.tsx`:

1. Extend props with `mode = "verify"`, optional `title` / `description`. Runtime-guard: if `mode === "verify"` and `dvrId` / `onVerified` missing, throw.
2. **Remove the builtin-only `GenericForm` early return.** Always render the combined RHF path even when `customs.length === 0`.
3. Empty state when both builtins and customs empty after resolve:
   - preview: `Select at least one field`
   - verify: `No fields to verify.`
4. When `mode === "preview"`:
   - Do not call `updateEntity` (skip mutation or never invoke it).
   - Wrap fields in `<fieldset disabled>` (or readOnly inputs).
   - Hide the Submit button.
   - Form `onSubmit` only calls `event.preventDefault()`.
5. Render optional chrome:

```tsx
{(title || description) && (
  <div className="space-y-1">
    {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
    {description ? (
      <p className="text-sm text-text-secondary">{description}</p>
    ) : null}
  </div>
)}
```

6. Keep scroll-to-first-error on verify validation/mutation errors.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/helpers/dvr.test.ts src/components/dvr/dvr-verify-form.test.tsx
```

Expected: PASS. Fix label/error assertions if AutoForm wording differs; do not weaken to smoke-only asserts.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/dvr.ts src/helpers/dvr.test.ts \
  src/components/dvr/dvr-verify-form.tsx src/components/dvr/dvr-verify-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(fe): add DVR verify form preview mode and stub user

EOF
)"
```

---

### Task 3: Medium verify UX polish (shared chrome + mobile)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/dvr/dvr-verify-form.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/verify/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/dvr/dvr-verify-form.test.tsx`

**Interfaces:**
- Consumes: `title` / `description` from Task 2
- Produces: loading skeleton instead of `null`; bottom padding so sticky create footer does not cover last field; verify page hierarchy without double H1 inside the form

- [ ] **Step 1: Write failing polish assertion**

Add to `dvr-verify-form.test.tsx`:

```tsx
it("renders provided title and helper in preview", async () => {
  render(
    wrap(
      <DvrVerifyForm
        mode="preview"
        user={DVR_PREVIEW_STUB_USER}
        rawFields={[{ name: "city", required: false }]}
        title="Preview"
        description="This is what recipients will fill in."
      />,
    ),
  );
  expect(await screen.findByText("Preview")).toBeTruthy();
  expect(
    screen.getByText(/what recipients will fill in/i),
  ).toBeTruthy();
});
```

- [ ] **Step 2: Run test**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/components/dvr/dvr-verify-form.test.tsx
```

Expected: FAIL if chrome not yet on the unified path; otherwise PASS and continue.

- [ ] **Step 3: Apply polish**

1. Ensure title/description render in the unified form path.
2. Verify page: keep Back + page H1 + helper outside the form; do **not** pass a second H1 into `DvrVerifyForm` in verify mode (avoid double titles). Pass `description` only if useful.
3. Form root classes include bottom padding, e.g. `space-y-6 pb-24 lg:pb-8`.
4. Loading: replace `return null` with `<AutoFormFieldsSkeleton rows={4} />` from `@/components/form/auto-form-fields-skeleton`.
5. Required markers: keep existing AutoForm / `GroupSection` behavior driven by field configs (no second badge system).

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/components/dvr/dvr-verify-form.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/dvr/dvr-verify-form.tsx \
  src/components/dvr/dvr-verify-form.test.tsx \
  "src/app/(internal)/data-verification-requests/[id]/verify/page.tsx"
git commit -m "$(cat <<'EOF'
feat(fe): polish DVR verify form hierarchy and loading

EOF
)"
```

---

### Task 4: `DvrCreateDesigner` shell + create page rewrite

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/dvr/dvr-create-designer.tsx`
- Create: `schedjuice-reimagined-fe/src/components/dvr/dvr-create-designer.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/create/page.tsx`

**Interfaces:**
- Consumes: `DvrFieldCatalog`, `DvrVerifyForm`, `DVR_PREVIEW_STUB_USER`, `RoleChooser`, `makePostRequest`, dvr helpers
- Produces: `export function DvrCreateDesigner(): JSX.Element`

- [ ] **Step 1: Write failing designer tests**

Create `dvr-create-designer.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DvrCreateDesigner } from "./dvr-create-designer";

const makePostRequest = vi.fn();
const push = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: (...args: unknown[]) => makePostRequest(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-form-config", () => ({
  useFormConfig: () => ({ data: { groups: [] }, isLoading: false }),
}));

vi.mock("@/components/form/role-chooser", () => ({
  default: ({
    roles,
    setRoles,
  }: {
    roles: string[];
    setRoles: (r: string[]) => void;
  }) => (
    <button type="button" onClick={() => setRoles([])}>
      roles:{roles.length}
    </button>
  ),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("DvrCreateDesigner", () => {
  beforeEach(() => {
    makePostRequest.mockReset();
    push.mockReset();
  });

  it("does not POST when all fields are unchecked", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));

    const includes = screen.getAllByRole("checkbox").filter((el) => {
      const id = el.getAttribute("id") || "";
      return id.length > 0 && !id.endsWith("-required");
    });
    for (const box of includes) {
      const checked =
        (box as HTMLInputElement).checked ||
        box.getAttribute("aria-checked") === "true";
      if (checked) await user.click(box);
    }

    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    expect(makePostRequest).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId("dvr-preview")).getByText(
        /select at least one field/i,
      ),
    ).toBeTruthy();
  });

  it("removes a field from preview when Include is unchecked", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));
    const preview = await screen.findByTestId("dvr-preview");
    expect(
      within(preview).getByLabelText(/phone/i),
    ).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /^phone number$/i }));
    await waitFor(() => {
      expect(within(preview).queryByLabelText(/phone/i)).toBeNull();
    });
    expect(document.getElementById("phone_number")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/components/dvr/dvr-create-designer.test.tsx
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement `DvrCreateDesigner` + thin create page**

Implement `src/components/dvr/dvr-create-designer.tsx`:

- State: `name`, `selectedFields`, `selectedRoles`, `expiresOn` (same defaults as current create page: `defaultDvrFieldConfigs`, `DVR_STAFF_ROLE_DEFAULTS`, `defaultDvrExpiresOn`, `mergeCustomFieldDefaults` on custom defs load).
- Sticky header: Back, H1, Name input, Expires date, `RoleChooser`.
- Body `lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]`:
  - Main: `data-testid="dvr-preview"` wrapping `DvrVerifyForm` with `mode="preview"`, `user={DVR_PREVIEW_STUB_USER}`, `rawFields={selectedFields}`, `title="Preview"`, `description="This is what recipients will fill in."`
  - Aside: sticky `DvrFieldCatalog`.
- Sticky footer: `{n} fields selected` + Submit button.
- Submit via `useMutation` → `makePostRequest("data-verification-requests", body)` with `{ name, fields, requested_user_types, expires_on }`. Same validation toasts as today (≥1 field, ≥1 role, expiry). Also reject blank name.
- On success: redirect to `/data-verification-requests/{id}` (fallback list), same as current `onSuccess`.

Rewrite `create/page.tsx` to:

```tsx
"use client";

import { DvrCreateDesigner } from "@/components/dvr/dvr-create-designer";
import { PageContainer } from "@/components/layout/page-container";

export default function DVRCreatePage() {
  return (
    <PageContainer width="wide" className="space-y-3">
      <DvrCreateDesigner />
    </PageContainer>
  );
}
```

Remove old context / GenericForm / inline catalog from the page.

Default `name`: match whatever AutoForm/`dvrCreateSchema` previously defaulted to (inspect current behavior; if empty was the default, start with `""`).

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/components/dvr/dvr-create-designer.test.tsx src/components/dvr/dvr-field-catalog.test.tsx src/components/dvr/dvr-verify-form.test.tsx
```

Expected: PASS. Adjust `within(preview)` queries if AutoForm labels differ.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/dvr/dvr-create-designer.tsx \
  src/components/dvr/dvr-create-designer.test.tsx \
  "src/app/(internal)/data-verification-requests/create/page.tsx"
git commit -m "$(cat <<'EOF'
feat(fe): DVR create designer layout with live preview

EOF
)"
```

---

### Task 5: Verification gate

**Files:** none new

- [ ] **Step 1: Run DVR unit tests**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit -- src/components/dvr/ src/helpers/dvr.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Typecheck**

```bash
cd schedjuice-reimagined-fe && pnpm typecheck
```

Expected: clean for touched files.

- [ ] **Step 3: Manual browser checks**

1. Create: sticky header/footer; right catalog; preview updates on Include toggle.
2. Required toggle does not remove preview field.
3. Submit with 0 fields blocked; valid create redirects to detail.
4. Verify as enrolled user: required blocks submit; success still marks verified.
5. Mobile: stack header → preview → catalog → footer; footer does not cover last field.

- [ ] **Step 4: Commit any QA fixes** if needed; otherwise done.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Sticky meta + footer; preview main; catalog right | Task 4 |
| Include/Required in catalog only; live preview | Tasks 1, 4 |
| Always-visible catalog; mobile stack | Task 4 |
| Shared `DvrVerifyForm` preview mode | Task 2 |
| Medium polish (hierarchy, empty, loading, mobile pad) | Task 3 |
| Validation + payload unchanged | Task 4 |
| High-value tests listed in spec | Tasks 1, 2, 4 |
| No backend / no Sheet / no DnD | Global constraints |

## Consistency check

- Mode prop: `mode: "verify" | "preview"` throughout.
- Stub: `DVR_PREVIEW_STUB_USER`.
- Catalog: `DvrFieldCatalog`.
- Shell: `DvrCreateDesigner`.
- Empty preview copy: `Select at least one field`.
