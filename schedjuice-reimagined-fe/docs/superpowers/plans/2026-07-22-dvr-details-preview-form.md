# DVR Details Preview Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the admin DVR details page, replace the “Requested Fields” bullet list with the same disabled `DvrVerifyForm` preview used on create.

**Architecture:** FE-only change to `DVRDetailsPage`. After the existing DVR `useQuery` succeeds, render `DvrVerifyForm` in `mode="preview"` with `DVR_PREVIEW_STUB_USER` and persisted `dvrData.fields`. Drop page-level custom-field label mapping; the form already loads definitions. No new shared wrapper and no backend work.

**Tech Stack:** Next.js client page, React Query, Vitest + Testing Library, existing `DvrVerifyForm` / `DVR_PREVIEW_STUB_USER`.

**Spec:** `docs/superpowers/specs/2026-07-22-dvr-details-preview-form-design.md`

## Global Constraints

- FE-only; no backend, permissions, or API shape changes.
- Preview chrome must match create: `title="Preview"`, `description="This is what recipients will fill in."`, `data-testid="dvr-preview"`, `user={DVR_PREVIEW_STUB_USER}`.
- Layout stays a vertical stack under existing metadata (name, audit, expiry, copy link). No two-column layout, catalog, or settings sheet on details.
- No separate required/optional summary outside the form.
- Do not extract a `DvrPreviewPanel` wrapper.
- High-value tests only: assert preview mount + absence of “Requested Fields”; do not re-test widget/required behavior.
- FE unit tests: `pnpm test:unit -- <path>` from `schedjuice-reimagined-fe`.
- Details field display supersedes the bullet-list approach in earlier DVR upgrade / custom-fields specs.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/(internal)/data-verification-requests/[id]/page.tsx` | Modify | Swap bullet list for preview form; remove unused label helpers |
| `src/app/(internal)/data-verification-requests/[id]/page.test.tsx` | Create | High-value asserts for preview presence and old list absence |

---

### Task 1: Details page preview form

**Files:**
- Create: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/page.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/page.tsx`

**Interfaces:**
- Consumes: `DvrVerifyForm` from `@/components/dvr/dvr-verify-form` (`mode`, `user`, `rawFields`, `title`, `description`); `DVR_PREVIEW_STUB_USER` from `@/helpers/dvr`
- Produces: Details success UI includes `<div data-testid="dvr-preview">` wrapping preview-mode `DvrVerifyForm`; no “Requested Fields” heading

- [ ] **Step 1: Write the failing page test**

Create `src/app/(internal)/data-verification-requests/[id]/page.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DVRDetailsPage from "./page";

const fetchEntity = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/data-verification-requests/42",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/misc/back-button", () => ({
  default: () => <button type="button">Back</button>,
}));

vi.mock("@/components/misc/copy-input", () => ({
  default: () => <div>DVR Link</div>,
}));

vi.mock("@/components/misc/audit-display", () => ({
  default: () => <div>Audit</div>,
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

afterEach(() => {
  cleanup();
});

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("DVRDetailsPage preview", () => {
  beforeEach(() => {
    fetchEntity.mockReset();
    fetchEntity.mockResolvedValue({
      data: {
        data: {
          id: 42,
          name: "Staff verify",
          fields: [{ name: "phone_number", required: true }],
          expires_on: "2026-08-01",
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          created_by: null,
        },
      },
    });
  });

  it("shows preview form instead of Requested Fields list", async () => {
    render(wrap(<DVRDetailsPage />));

    await waitFor(() => {
      expect(screen.getByTestId("dvr-preview")).toBeTruthy();
    });
    expect(screen.queryByText(/requested fields/i)).toBeNull();
    expect(
      screen.getByText(/this is what recipients will fill in/i),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/app/\(internal\)/data-verification-requests/\[id\]/page.test.tsx
```

Expected: FAIL — `dvr-preview` not found (page still renders “Requested Fields” list).

- [ ] **Step 3: Implement preview on details page**

Replace the contents of `src/app/(internal)/data-verification-requests/[id]/page.tsx` with:

```tsx
"use client";
import { buttonVariants, Skeleton } from "@/components/primitives";
import {
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import { DvrVerifyForm } from "@/components/dvr/dvr-verify-form";
import AuditDisplay from "@/components/misc/audit-display";
import BackButton from "@/components/misc/back-button";
import CopyInput from "@/components/misc/copy-input";
import { DVR_PREVIEW_STUB_USER } from "@/helpers/dvr";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

const DVRDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["get-dvr", id],
    queryFn: () => fetchEntity("data-verification-requests", id, ["created_by"]),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between">
          <BackButton href="/data-verification-requests" />
          <Skeleton className="h-10 w-16" />
        </div>
        <div className={adminCrudSurfaceClassName()}>
          <div className={adminCrudSurfaceHeaderClassName()}>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className={cn(adminCrudSurfaceBodyClassName(), "space-y-3")}>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.data?.data) {
    return (
      <div className="space-y-3">
        <BackButton href="/data-verification-requests" />
        <div className={adminCrudSurfaceClassName()}>
          <div className={cn(adminCrudSurfaceBodyClassName(), "p-6")}>
            <p className="text-destructive">
              Error loading data verification request. Please try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const dvrData = data.data.data;

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex justify-between">
        <BackButton href="/data-verification-requests" />
        <Link
          className={cn(buttonVariants({ variant: "primary" }))}
          href={`/data-verification-requests/${id}/edit`}
        >
          Edit
        </Link>
      </div>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">
            {dvrData.name || "Untitled Request"}
          </h2>
          <AuditDisplay
            created_at={dvrData.created_at}
            updated_at={dvrData.updated_at}
            created_by={dvrData.created_by}
          />
        </div>
        <div className={cn(adminCrudSurfaceBodyClassName(), "space-y-3")}>
          {dvrData.expires_on ? (
            <p className="text-sm text-text-secondary">
              Expires on{" "}
              <span className="font-medium text-text-primary">
                {dvrData.expires_on}
              </span>
            </p>
          ) : null}
          <CopyInput
            description="Give this link to users to let them verify their data."
            label="DVR Link"
            text={`${window.location.origin}/data-verification-requests/${id}/verify`}
          />
          <div data-testid="dvr-preview">
            <DvrVerifyForm
              mode="preview"
              user={DVR_PREVIEW_STUB_USER}
              rawFields={dvrData.fields}
              title="Preview"
              description="This is what recipients will fill in."
            />
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default DVRDetailsPage;
```

Notes for the implementer:

- Remove imports that only served the bullet list: `Field`, `normalizeDvrFields`, `isDvrBuiltinField`, `useMemo`, `useFieldDefinitions`, `CUSTOM_FIELD_ENTITY_USER`.
- Do not change loading/error shells beyond what is required for a clean compile.
- Do not add a taller loading skeleton unless already touching that block for another reason (optional in spec; skip for YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/app/\(internal\)/data-verification-requests/\[id\]/page.test.tsx
```

Expected: PASS (the single `shows preview form instead of Requested Fields list` test).

If `DvrVerifyForm` needs extra mocks (e.g. toast), mirror the mocks in `src/components/dvr/dvr-create-designer.test.tsx` / `dvr-verify-form.test.tsx` until the page test is green — do not weaken the two assertions above.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  "src/app/(internal)/data-verification-requests/[id]/page.tsx" \
  "src/app/(internal)/data-verification-requests/[id]/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat(dvr): show preview form on details page

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Replace bullet list with preview | Task 1 |
| Same create chrome copy + stub user + `dvr-preview` | Task 1 Step 3 |
| Vertical stack under metadata | Task 1 Step 3 (layout unchanged aside from field block) |
| Drop page-level `labelByKey` / field-definition fetch | Task 1 Step 3 |
| High-value tests only | Task 1 Step 1 |
| No backend / no shared wrapper / no summary | Global constraints + Task 1 (no extra files) |
