# Copy Student Name / Email Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excel-style per-column copy of student names and emails (via a ⋯ column menu that also owns sort) on course students and student payments, including an Email column + API field on payments.

**Architecture:** Extend `ResourceTable` with an opt-in column header overflow menu (sort + copy). Share a pure `copyVisibleColumnValues` helper. Backend adds `user.email` to admin-report rows. Wire Name/Email (roster) and Student/Email (payments ResourceTable + Glide) to the menu; payments copy dedupes by `user.id` on the visible page.

**Tech Stack:** Django/`admin_report_payment_row`, Next.js FE, `@/components/data-table`, `@/components/primitives` `Menu`, Vitest, Django tests with `--keepdb`.

**Spec:** `docs/superpowers/specs/2026-07-22-copy-student-name-email-columns-design.md`

## Global Constraints

- Clipboard format: values joined by `\n` (Excel column); blank cells → empty lines.
- Row scope: **current visible page only**.
- Payments copy: **dedupe by `user.id`**, first-seen order; skip `group_part` flattened rows.
- Header UX for opted-in columns: **⋯ menu** with Sort ascending / Sort descending / Clear sort (when sorted) / Copy column — label is **not** the sort click target.
- Other columns keep today’s label-click `SortableHeader` (or Glide header-click sort).
- Payments: add visible **Email** column after Student; BE must include `user.email`.
- No multi-column TSV, no all-pages copy, no history/unpaid-students scope.
- High-value tests only (auth/edge/invariants) — no happy-path-only smoke.
- BE tests: `./scripts/run_backend_tests.sh <target>` or `./env/bin/python manage.py test <target> -v 2 --keepdb --noinput` from `schedjuice-reimagined-be`.
- FE unit tests: `pnpm test:unit -- <path>` from `schedjuice-reimagined-fe`.
- FE and BE are **separate git repos** — commit in the repo you change.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `schedjuice-reimagined-be/app_finance/payment_group.py` | Modify | Add `email` to `admin_report_payment_row` `user` dict |
| `schedjuice-reimagined-be/app_finance/tests/test_user_payment_verified_by.py` | Modify | Assert `user.email` on `admin_report_payment_row` |
| `schedjuice-reimagined-fe/src/helpers/copy-visible-column-values.ts` | Create | Pure join + optional dedupe |
| `schedjuice-reimagined-fe/src/helpers/copy-visible-column-values.test.ts` | Create | Dedupe / empty / order tests |
| `schedjuice-reimagined-fe/src/helpers/copy-column.ts` | Delete | Unused TanStack helper — replaced |
| `schedjuice-reimagined-fe/src/components/data-table/types.ts` | Modify | Optional `headerMenu?: { copy?: boolean }` on `Column` |
| `schedjuice-reimagined-fe/src/components/data-table/parts/column-header-menu.tsx` | Create | ⋯ Menu UI for sort + copy |
| `schedjuice-reimagined-fe/src/components/data-table/parts/column-header-menu.test.tsx` | Create | Copy does not change sorts; sort items call handlers |
| `schedjuice-reimagined-fe/src/components/data-table/parts/index.ts` | Modify | Export menu |
| `schedjuice-reimagined-fe/src/components/data-table/use-table-instance.ts` | Modify | Pass `headerMenu` through header meta; add explicit sort setters |
| `schedjuice-reimagined-fe/src/components/data-table/table.tsx` | Modify | Render `ColumnHeaderMenu` when `headerMenu` opted in |
| `schedjuice-reimagined-fe/src/components/data-table/columns.ts` | Modify | Optional `headerMenu` on builders |
| `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/students/page.tsx` | Modify | Enable header menu + copy on name/email |
| `schedjuice-reimagined-fe/src/lib/finances/payment-column-copy.ts` | Create | Visible payment student slots (skip parts) |
| `schedjuice-reimagined-fe/src/lib/finances/payment-column-copy.test.ts` | Create | Skip parts + slot shape |
| `schedjuice-reimagined-fe/src/components/finances/student-payments-report.tsx` | Modify | `user.email` on row type |
| `schedjuice-reimagined-fe/src/lib/finances/student-payments-resource-column-meta.ts` | Modify | Email column layout entry |
| `schedjuice-reimagined-fe/src/components/finances/student-payments-resource-table.tsx` | Modify | Email column + header menus + copy |
| `schedjuice-reimagined-fe/src/components/finances/student-payments-grid.tsx` | Modify | Email col; header menu overlay for Student/Email |
| `schedjuice-reimagined-fe/src/components/finances/payments-grid/payment-column-header-menu-overlay.tsx` | Create | Anchored Menu for Glide header actions |

---

### Task 1: Backend — include `user.email` on admin-report rows

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py` (`admin_report_payment_row`)
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_user_payment_verified_by.py`

**Interfaces:**
- Consumes: `payment.user.email`
- Produces: `row["user"]` shape `{ "id", "name", "email" }`

- [ ] **Step 1: Write the failing assertion**

In `test_user_payment_verified_by.py`, extend `test_admin_report_row_includes_verified_by_name` (or add `test_admin_report_row_includes_user_email`) inside the same `schema_context` pattern:

```python
row = admin_report_payment_row(payment)
self.assertEqual(row["user"]["email"], payment.user.email)
self.assertIn("email", row["user"])
```

Use the payment’s real user email from the fixture (read `payment.user.email` after select_related).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_user_payment_verified_by.UserPaymentVerifiedByTests.test_admin_report_row_includes_user_email
```

Expected: FAIL — `KeyError: 'email'` or assertion missing key.

- [ ] **Step 3: Implement**

In `admin_report_payment_row`, change the `user` dict to:

```python
"user": {
    "id": payment.user.id,
    "name": payment.user.name,
    "email": payment.user.email,
},
```

- [ ] **Step 4: Run test to verify it passes**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit (BE repo)**

```bash
cd schedjuice-reimagined-be
git add app_finance/payment_group.py app_finance/tests/test_user_payment_verified_by.py
git commit -m "$(cat <<'EOF'
feat(finance): include user.email on admin-report payment rows

EOF
)"
```

---

### Task 2: FE helper — `copyVisibleColumnValues`

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/copy-visible-column-values.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/copy-visible-column-values.test.ts`
- Delete: `schedjuice-reimagined-fe/src/helpers/copy-column.ts`

**Interfaces:**
- Produces:

```ts
export function copyVisibleColumnValues(
  values: string[],
  options?: { dedupeKeys?: Array<string | number | null | undefined> },
): string;
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { copyVisibleColumnValues } from "./copy-visible-column-values";

describe("copyVisibleColumnValues", () => {
  it("joins with newlines and keeps blanks", () => {
    expect(copyVisibleColumnValues(["a", "", "c"])).toBe("a\n\nc");
  });

  it("returns empty string for empty input", () => {
    expect(copyVisibleColumnValues([])).toBe("");
  });

  it("dedupes by key preserving first-seen order", () => {
    expect(
      copyVisibleColumnValues(["Ann", "Bob", "Ann2"], {
        dedupeKeys: [1, 2, 1],
      }),
    ).toBe("Ann\nBob");
  });

  it("uses row index fallback when dedupe key is null", () => {
    expect(
      copyVisibleColumnValues(["a", "b"], {
        dedupeKeys: [null, null],
      }),
    ).toBe("a\nb");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/helpers/copy-visible-column-values.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function copyVisibleColumnValues(
  values: string[],
  options?: { dedupeKeys?: Array<string | number | null | undefined> },
): string {
  const keys = options?.dedupeKeys;
  if (!keys) {
    return values.join("\n");
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const raw = keys[i];
    const key =
      raw === null || raw === undefined || raw === ""
        ? `__idx:${i}`
        : String(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(values[i] ?? "");
  }
  return out.join("\n");
}
```

Delete `src/helpers/copy-column.ts` (unused; confirm no imports first).

- [ ] **Step 4: Run tests — expect PASS**

Same command as Step 2.

- [ ] **Step 5: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/copy-visible-column-values.ts src/helpers/copy-visible-column-values.test.ts
git rm -f src/helpers/copy-column.ts
git commit -m "$(cat <<'EOF'
feat: add copyVisibleColumnValues helper for Excel column copy

EOF
)"
```

---

### Task 3: `ColumnHeaderMenu` + ResourceTable wiring

**Files:**
- Modify: `src/components/data-table/types.ts`
- Modify: `src/components/data-table/columns.ts`
- Modify: `src/components/data-table/use-table-instance.ts`
- Modify: `src/components/data-table/table.tsx`
- Modify: `src/components/data-table/parts/index.ts`
- Create: `src/components/data-table/parts/column-header-menu.tsx`
- Create: `src/components/data-table/parts/column-header-menu.test.tsx`
- Modify: `src/components/data-table/__tests__/use-table-instance.test.ts` (sort setter helpers)

**Interfaces:**
- Extends `Column<T>`:

```ts
headerMenu?: {
  /** When true, show Copy column in the ⋯ menu. */
  copy?: boolean;
};
```

- Header menu props:

```ts
export type ColumnHeaderMenuProps = {
  label: ReactNode;
  columnId: string;
  sorted: "asc" | "desc" | false;
  enableSorting: boolean;
  enableCopy: boolean;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onCopy: () => void;
};
```

- Sort helpers (export from `use-table-instance.ts`):

```ts
export function setColumnSortAsc(columnId: string): string[]; // [columnId]
export function setColumnSortDesc(columnId: string): string[]; // [`-${columnId}`]
export function clearSorts(): string[]; // []
```

(Payments/roster use single-column sort via existing `cycleColumnSorts` model — Clear = `[]`.)

- [ ] **Step 1: Write failing menu tests**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnHeaderMenu } from "./column-header-menu";

describe("ColumnHeaderMenu", () => {
  it("invokes onCopy without calling sort handlers", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onSortAsc = vi.fn();
    render(
      <ColumnHeaderMenu
        label="Name"
        columnId="name"
        sorted={false}
        enableSorting
        enableCopy
        onSortAsc={onSortAsc}
        onSortDesc={vi.fn()}
        onClearSort={vi.fn()}
        onCopy={onCopy}
      />,
    );
    await user.click(screen.getByRole("button", { name: /column actions for name/i }));
    await user.click(screen.getByRole("menuitem", { name: /copy column/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onSortAsc).not.toHaveBeenCalled();
  });

  it("calls onSortAsc from menu", async () => {
    const user = userEvent.setup();
    const onSortAsc = vi.fn();
    render(
      <ColumnHeaderMenu
        label="Email"
        columnId="email"
        sorted={false}
        enableSorting
        enableCopy
        onSortAsc={onSortAsc}
        onSortDesc={vi.fn()}
        onClearSort={vi.fn()}
        onCopy={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /column actions for email/i }));
    await user.click(screen.getByRole("menuitem", { name: /sort ascending/i }));
    expect(onSortAsc).toHaveBeenCalledTimes(1);
  });

  it("hides clear sort when unsorted", async () => {
    const user = userEvent.setup();
    render(
      <ColumnHeaderMenu
        label="Name"
        columnId="name"
        sorted={false}
        enableSorting
        enableCopy
        onSortAsc={vi.fn()}
        onSortDesc={vi.fn()}
        onClearSort={vi.fn()}
        onCopy={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /column actions for name/i }));
    expect(screen.queryByRole("menuitem", { name: /clear sort/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test:unit -- src/components/data-table/parts/column-header-menu.test.tsx
```

- [ ] **Step 3: Implement menu + table wiring**

`column-header-menu.tsx` pattern (use existing `Menu` + `Button` ghost + `MoreHoriz`):

```tsx
<div className="inline-flex items-center gap-1">
  <span className="font-sans text-sm font-medium text-text-secondary">{label}</span>
  <Menu.Root>
    <Menu.Trigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label={`Column actions for ${typeof label === "string" ? label : columnId}`}
        />
      }
    >
      <MoreHoriz width={14} height={14} />
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner>
        <Menu.Popup>
          {enableSorting ? (
            <>
              <Menu.Item onClick={onSortAsc}>Sort ascending</Menu.Item>
              <Menu.Item onClick={onSortDesc}>Sort descending</Menu.Item>
              {sorted ? (
                <Menu.Item onClick={onClearSort}>Clear sort</Menu.Item>
              ) : null}
              {enableCopy ? <Menu.Separator /> : null}
            </>
          ) : null}
          {enableCopy ? (
            <Menu.Item onClick={onCopy}>Copy column</Menu.Item>
          ) : null}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
</div>
```

Match `Menu.Trigger` / `Button` composition to a nearby working example (`course-feed-card.tsx` or `course-record-header-actions.tsx`) if `render=` API differs slightly.

In `types.ts`, add `headerMenu?: { copy?: boolean }` to `Column<T>`.

In `columns.ts` builders, accept optional `headerMenu` and pass through.

In `use-table-instance.ts`:
- Add `setColumnSortAsc` / `setColumnSortDesc` / `clearSorts` as above.
- Plumb `headerMenu` onto header cell meta so `table.tsx` can read `headerCell.headerMenu`.

In `table.tsx`, when `headerCell.headerMenu` is set (and `copy` or sorting applies):

```tsx
{headerCell.headerMenu ? (
  <ColumnHeaderMenu
    label={headerCell.content}
    columnId={headerCell.columnId}
    sorted={headerCell.sorted}
    enableSorting={Boolean(headerCell.enableSorting && onSortsChange)}
    enableCopy={Boolean(headerCell.headerMenu.copy)}
    onSortAsc={() => onSortsChange?.(setColumnSortAsc(headerCell.columnId))}
    onSortDesc={() => onSortsChange?.(setColumnSortDesc(headerCell.columnId))}
    onClearSort={() => onSortsChange?.(clearSorts())}
    onCopy={() => headerCell.headerMenu?.onCopy?.()}
  />
) : headerCell.enableSorting && onSortsChange ? (
  <SortableHeader ... />
) : (
  headerCell.content
)}
```

**Copy callback wiring:** `headerMenu.copy` alone is not enough — pages need to pass behavior. Prefer:

```ts
headerMenu?: {
  copy?: boolean;
  onCopy?: () => void;
};
```

Store `onCopy` on the column definition; `use-table-instance` copies it onto the header cell. Pages set `onCopy` per column.

Do **not** use `SortableHeader` when `headerMenu` is present.

- [ ] **Step 4: Run menu + sort-helper tests — expect PASS**

```bash
pnpm test:unit -- src/components/data-table/parts/column-header-menu.test.tsx src/components/data-table/__tests__/use-table-instance.test.ts
```

Add quick unit asserts for `setColumnSortAsc("name") === ["name"]`, `setColumnSortDesc("name") === ["-name"]`, `clearSorts() === []`.

- [ ] **Step 5: Commit**

```bash
git add src/components/data-table
git commit -m "$(cat <<'EOF'
feat(data-table): add column header overflow menu for sort and copy

EOF
)"
```

---

### Task 4: Course students — enable Name/Email column menu + copy

**Files:**
- Modify: `src/app/(internal)/courses/[id]/students/page.tsx`

**Interfaces:**
- Consumes: `copyVisibleColumnValues`, `Column.headerMenu`, `useToast`
- Uses visible `list.rows` from the page’s resource list (current page)

- [ ] **Step 1: Wire columns**

Replace `column.text` for name/email with explicit columns (or extend builder) so `headerMenu` is set:

```tsx
{
  id: "name",
  header: "Name",
  accessor: (row) => userFromRow(row)?.name,
  enableSorting: true,
  sizing: { role: "prose" },
  headerMenu: {
    copy: true,
    onCopy: () => {
      const values = list.rows.map(
        (row) => userFromRow(row)?.name?.trim() ?? "",
      );
      const text = copyVisibleColumnValues(values);
      if (!text && list.rows.length === 0) {
        toast.add({ description: "Nothing to copy" });
        return;
      }
      void navigator.clipboard.writeText(text).then(
        () =>
          toast.add({
            description: `Copied ${list.rows.length} names`,
          }),
        () => toast.add({ description: "Could not copy to clipboard" }),
      );
    },
  },
  cell: ({ value }) =>
    value == null || value === "" ? "—" : String(value),
},
```

Same for `email` with “emails” toast label.

**Empty rule:** if `list.rows.length === 0`, toast “Nothing to copy” and skip `writeText`. If rows exist but all blank, still write the blank lines and toast the count.

Ensure `onCopy` closes over current `list.rows` (define columns in `useMemo` with `list.rows` + `toast` deps).

- [ ] **Step 2: Manual check**

Run the app, open a course students page with ≥1 student, open Name ⋯ → Copy column, paste into a text editor — one name per line. Confirm sort still works via menu and does not fire when copying.

- [ ] **Step 3: Commit**

```bash
git add src/app/(internal)/courses/[id]/students/page.tsx
git commit -m "$(cat <<'EOF'
feat(course-students): copy name and email columns via header menu

EOF
)"
```

---

### Task 5: Payments ResourceTable — Email column + copy (deduped)

**Files:**
- Create: `src/lib/finances/payment-column-copy.ts`
- Create: `src/lib/finances/payment-column-copy.test.ts`
- Modify: `src/components/finances/student-payments-report.tsx`
- Modify: `src/lib/finances/student-payments-resource-column-meta.ts`
- Modify: `src/lib/finances/student-payments-resource-column-meta.test.ts` (if present — update expected ids)
- Modify: `src/components/finances/student-payments-resource-table.tsx`

**Interfaces:**

```ts
// payment-column-copy.ts
export type PaymentCopyStudentSlot = {
  userId: number | null;
  name: string;
  email: string;
};

export function paymentStudentSlotsForCopy(
  pageRows: Array<{
    user?: { id?: number; name?: string; email?: string } | null;
    __flatKind?: string;
  }>,
): PaymentCopyStudentSlot[];
```

Skip rows where `__flatKind === "group_part"`. Map `name`/`email` with `?? ""`.

- [ ] **Step 1: Failing tests for slots helper**

```ts
import { describe, expect, it } from "vitest";
import { paymentStudentSlotsForCopy } from "./payment-column-copy";

describe("paymentStudentSlotsForCopy", () => {
  it("skips group_part rows", () => {
    expect(
      paymentStudentSlotsForCopy([
        { user: { id: 1, name: "A", email: "a@x" }, __flatKind: "group_parent" },
        { user: { id: 1, name: "A", email: "a@x" }, __flatKind: "group_part" },
        { user: { id: 2, name: "B", email: "b@x" }, __flatKind: "standalone" },
      ]),
    ).toEqual([
      { userId: 1, name: "A", email: "a@x" },
      { userId: 2, name: "B", email: "b@x" },
    ]);
  });
});
```

- [ ] **Step 2: Implement helper; run test PASS**

- [ ] **Step 3: Types + column meta**

In `student-payments-report.tsx`:

```ts
user?: { id?: number; name?: string; email?: string } | null;
```

In `studentPaymentsResourceColumnLayout`, insert after `user__name`:

```ts
{
  id: "user__email",
  contentRole: "prose",
  minWidth: "12rem",
  preferredWidth: "16rem",
  align: "left",
  truncate: true,
},
```

Update any meta snapshot/unit tests that list column ids in order.

- [ ] **Step 4: Resource table columns**

After the Student column definition, add:

```tsx
{
  id: "user__email",
  header: "Email",
  accessor: (row) => row.user?.email,
  enableSorting: false,
  sizing: { role: "prose" },
  headerMenu: {
    copy: true,
    onCopy: () => copyPaymentColumn("email"),
  },
  cell: ({ row, value }) => {
    if (row.__flatKind === "group_part") {
      return <span className="text-muted-foreground"> </span>;
    }
    return value == null || value === "" ? "—" : String(value);
  },
},
```

On Student (`user__name`), set `headerMenu: { copy: true, onCopy: () => copyPaymentColumn("name") }` (keep `enableSorting: false` — menu shows Copy only).

Define `copyPaymentColumn` inside the component:

```tsx
const copyPaymentColumn = (field: "name" | "email") => {
  const slots = paymentStudentSlotsForCopy(pageRowsAsTableRows);
  if (slots.length === 0) {
    toast.add({ description: "Nothing to copy" });
    return;
  }
  const values = slots.map((s) => (field === "name" ? s.name : s.email));
  const dedupedText = copyVisibleColumnValues(values, {
    dedupeKeys: slots.map((s) => s.userId),
  });
  const n = dedupedText === "" ? 0 : dedupedText.split("\n").length;
  void navigator.clipboard.writeText(dedupedText).then(
    () =>
      toast.add({
        description: `Copied ${n} ${field === "name" ? "names" : "emails"}`,
      }),
    () => toast.add({ description: "Could not copy to clipboard" }),
  );
};
```

Use the **current page** row array already fed to `ResourceTable` (mapped `pageRows` / list result rows), not the full unpaginated `filteredRows`.

- [ ] **Step 5: Run unit tests**

```bash
pnpm test:unit -- src/lib/finances/payment-column-copy.test.ts src/lib/finances/student-payments-resource-column-meta.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/finances/payment-column-copy.ts src/lib/finances/payment-column-copy.test.ts \
  src/components/finances/student-payments-report.tsx \
  src/lib/finances/student-payments-resource-column-meta.ts \
  src/lib/finances/student-payments-resource-column-meta.test.ts \
  src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
feat(student-payments): email column and deduped name/email copy

EOF
)"
```

---

### Task 6: Payments Glide grid — Email column + header menu overlay

**Files:**
- Create: `src/components/finances/payments-grid/payment-column-header-menu-overlay.tsx`
- Modify: `src/components/finances/student-payments-grid.tsx`

**Interfaces:**
- Overlay mirrors ResourceTable menu items; opens when header clicked for `user__name` / `user__email`.
- Other columns keep existing header-click sort behavior.

- [ ] **Step 1: Add Email to `gridCols`**

Immediately after Student:

```ts
cols.push({ id: "user__name", title: "Student", width: 200 });
cols.push({ id: "user__email", title: "Email", width: 220 });
```

In `getCellContent`, handle `user__email`:

```ts
if (field === "user__email") {
  const email = record.user?.email ?? "";
  return {
    kind: GridCellKind.Text,
    data: email,
    displayData: email || "—",
    allowOverlay: false,
    readonly: true,
    copyData: email,
  };
}
```

Ensure expand/fields already return `user.email` once BE ships (Task 1). No extra fetch.

- [ ] **Step 2: Header menu overlay**

Create `payment-column-header-menu-overlay.tsx` modeled on `payment-grid-overlays.tsx` fixed-position `Menu.Root`:

Props:

```ts
type Props = {
  target: { rect: { x: number; y: number; width: number; height: number } } | null;
  columnId: "user__name" | "user__email";
  sorted: "asc" | "desc" | false;
  onClose: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onCopy: () => void;
};
```

Show Clear sort only when `sorted` is truthy. Sort items optional if grid sort for that field is unsupported — student payments grid is `sortable: true`; wire sort through the same sort state the grid already uses for header clicks (intercept only these two column ids).

- [ ] **Step 3: Intercept header click**

In the grid’s header-click path (DataSheet `onHeaderClicked` / existing sort handler):

- If column id is `user__name` or `user__email`: set overlay target from event bounds; **do not** immediately cycle sort.
- Else: existing sort behavior.

Copy handler: build slots from **currently displayed grid rows** (same page/window the grid is showing — the `rows` array bound to the sheet after filters), skip group parts the same way as ResourceTable (`paymentStudentSlotsForCopy`), dedupe, clipboard + toast.

- [ ] **Step 4: Manual check**

Toggle Glide view on student payments; confirm Email column; ⋯/header menu copies deduped emails; other column headers still sort on click.

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/payments-grid/payment-column-header-menu-overlay.tsx \
  src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
feat(student-payments): Glide email column and header copy menu

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Excel `\n` column copy | Task 2 |
| Visible page only | Tasks 4–6 |
| Name-only / email-only | Tasks 4–6 |
| ⋯ menu with sort + copy | Tasks 3–4, 6 |
| Label not sort target on menu columns | Task 3 |
| Payments Email column + API email | Tasks 1, 5, 6 |
| Dedupe by `user.id` on payments | Tasks 5–6 |
| Course students Name/Email | Task 4 |
| Glide parity | Task 6 |
| High-value tests | Tasks 1–3, 5 |
| Out of scope (history, unpaid, multi-col TSV) | Not planned |

No TBD placeholders remain after simplifying Task 5 copy sketch to a single dedupe pass in implementation.
