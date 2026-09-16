# Student Payments Drawer — Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)

## Problem

On the Recent Transactions page (`/finances/recent-transactions`), clicking a
student name opens a student-payment detail view. Today this view is rendered as
a cramped ~256px (`16rem`) inline column squeezed beside the data grid (Glide
view) or as a sidebar+detail split that replaces the table (legacy DataTable
view). The narrow column forces tiny text, a stacked mini student-switcher, and
a clipped payments table — an awkward placement for what is the page's primary
drill-down.

The leads CRM already solves this pattern well with `LeadDetailDrawer`: a roomy
shadcn `Sheet` sliding in from the right at ~720–820px.

The detail logic is also duplicated: once in
`src/components/finances/recent-transactions-side-panel.tsx` (Glide view) and
again inline in `src/app/(internal)/finances/recent-transactions/page.tsx`
(legacy view).

## Goal

Replace both cramped detail layouts with a single large right-side drawer,
modeled on `LeadDetailDrawer`, shared by both rendering modes of the page.

## Non-goals

- No change to the underlying `user-payments/admin-report` API or its data.
- No change to the generic `sidePanel`/split plumbing inside
  `StudentPaymentsGrid` (it is also used by the report variant). We stop *using*
  it for recent-transactions; we do not remove it.
- No change to verification/upload, screenshot dialog, or grid editing flows
  beyond rewiring where the student drawer opens from.

## Approach

One shared `StudentPaymentsDrawer` component on top of the shadcn `Sheet`
primitive, with the detail data fetch extracted into a reusable hook. Both views
render the same drawer; the page keeps owning the open/selected state and its
`?studentId=` URL sync.

## Components & files

### New: `src/hooks/finances/use-student-payments-detail.ts`

Centralizes the currently-duplicated detail query.

- Input: `studentId: string` (and reads `useUser`).
- Builds `buildStudentDetailFilterParams` (moved here from the two call sites):
  - membership-scoped users add `course__user_courses__user_id = user.id`;
  - always add `user_id = studentId`.
- Runs the React Query (`queryKey: ["student-payments-detail", studentId, user?.id]`)
  against `user-payments/admin-report` with `size: -1, sorts: ["-billing_start_date"]`.
- Client-side scopes rows to the requested `user_id` and sorts via
  `sortStudentPaymentDetailRows` (moved here).
- `enabled` mirrors existing logic: requires a user, a non-empty studentId, and
  the right filter-param count for scoped vs unscoped users.
- Returns `{ query, rows, studentName }` where `studentName` is derived from the
  matching row (today's `studentDetailPanelName` logic).

### New: `src/components/finances/student-payments-drawer.tsx`

```ts
export function StudentPaymentsDrawer({
  studentId,                    // "" => closed
  onClose,
  onViewScreenshot,
}: {
  studentId: string;
  onClose: () => void;
  onViewScreenshot: (url: string) => void;
}): JSX.Element | null;
```

Structure (mirrors `LeadDetailDrawer` conventions):

- `<Sheet open={Boolean(studentId.trim())} onOpenChange={(o) => !o && onClose()}>`
- `<SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[720px] lg:w-[820px]">`
- **Header** (`SheetHeader`): `SheetTitle` = student name (fallback "Student"),
  `SheetDescription` = "All payments for this student across all classes."
- **Summary strip**: thin-ruled row (no card boxes), `font-mono` figures:
  - total payments (count)
  - verified count
  - total verified amount (`formatMoney(sum of verified parsed_amount, currencySymbol)`)
- **Body** (scrollable, `flex-1 overflow-auto`): list of payment cards.
- Uses `use-student-payments-detail` for data; `useTenant` /
  `useTenantCurrencySymbol` for formatting.

#### Payment card

One card per payment row, each showing:

- Course title (heading).
- Status pill (`snakeToTitle(row.status)`).
- Billing period: `formatDate(billing_start_date) – formatDate(billing_end_date)`,
  falling back to `formatDate(issued_at)` then `—`.
- For `user_upload` tenants, omit payment-account / date-on-screenshot the way
  the current tables do; otherwise include payment account + date on screenshot.
- Amount, `font-mono` right/inline: `formatMoney(parsed_amount, currencySymbol)`
  or `—`.
- Transaction ID, `font-mono`, truncatable/break-all, `—` when absent.
- "View screenshot" button → `onViewScreenshot(row.screenshot)` when
  `row.screenshot` present.

#### States

- **Loading:** skeleton list (reuse `TableSkeleton` or simple skeleton cards).
- **Error:** inline `role="alert"` "Failed to load. Please try again."
- **Empty:** composed empty state "No payments found for this student."

### Changed: `src/app/(internal)/finances/recent-transactions/page.tsx`

- Keep: `studentId` state, `?studentId=` URL sync effect, Escape-to-close effect,
  `openStudentById` / `clearStudentId`, `viewImageUrl` + screenshot `Dialog`.
- Remove: the duplicated `buildStudentDetailFilterParams`,
  `sortStudentPaymentDetailRows`, `studentDetailQuery`, `studentDetailPanelName`,
  `uniqueStudents` / `filteredStudents` / `sidebarSearch`,
  `renderStudentDetailContent`, and the legacy inline sidebar+detail split JSX
  (the `isDetailOpen` collapse of the table and the desktop split block).
- **Glide branch:** stop passing `sidePanel` to `StudentPaymentsGrid`; render a
  single `<StudentPaymentsDrawer studentId=… onClose=clearStudentId
  onViewScreenshot=… />` in the page. Grid returns to full width.
- **Legacy branch:** table stays mounted full-width; student-name button still
  calls `openStudentById`; same `<StudentPaymentsDrawer>` renders for it. The
  table no longer collapses when a student is open.
- `tableApiRows` was only feeding the in-panel student switcher; since the drawer
  is single-focus, it can be removed (and the `customComponentOnTable`
  fingerprint plumbing simplified accordingly).

### Deleted: `src/components/finances/recent-transactions-side-panel.tsx`

Replaced entirely by `StudentPaymentsDrawer` + the hook.

## Data flow

1. User clicks a student name (Glide cell or DataTable cell) → `openStudentById(uid)`
   → `setStudentId(String(uid))` → URL gains `?studentId=`.
2. `StudentPaymentsDrawer` opens (driven by non-empty `studentId`),
   `use-student-payments-detail` fetches that student's payments.
3. Clicking "View screenshot" → `onViewScreenshot(url)` → existing image `Dialog`
   (rendered above the sheet).
4. Close (X / overlay / Escape) → `onClose` → `clearStudentId()` → `studentId=""`,
   URL param removed, drawer animates out.

## Styling / design conventions

- Follow `LeadDetailDrawer`: slate tokens, `border-b` section separators,
  `px-6 py-5` header padding, 720/820px responsive width, full-width on mobile.
- Summary uses divided rules + `font-mono` numbers rather than nested cards
  (data-density treatment).
- No emojis; icons via `lucide-react` (already the project icon library).
- Tactile affordances on buttons (`active:scale-[0.98]`) consistent with the
  existing grid controls.

## Testing

- Manual: Glide view — click student opens wide drawer, grid full width, close
  restores; refresh with `?studentId=` reopens; Escape closes.
- Manual: legacy DataTable view — click student opens same drawer, table stays
  visible; mobile width collapses drawer to full screen.
- Manual: membership-scoped (teacher) user sees correctly scoped payments;
  unscoped admin sees all of the student's payments.
- Manual: loading skeleton, error, and empty states each render.
- Manual: screenshot dialog opens above the drawer and closes back to it.

## Risks

- Nested Radix dialogs (screenshot `Dialog` over `Sheet`): verify focus/overlay
  z-index behaves (leads `SheetOverlay` is `z-250`); adjust if the screenshot
  dialog renders behind the sheet.
- Removing `tableApiRows` plumbing must not break the legacy table's data load.
