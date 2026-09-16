# R14 — Payment Upload and Verification Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate admin payment upload, CSV verification upload, and multi-month coverage review routes so multipart layout, per-part validation, OCR wait gating, money field semantics, error scroll targeting, and page composition conform to R4/R5 contracts and Jul 10–11 payment upload evidence.

**Architecture:** R14 owns upload/verification/coverage-review pages and pure helpers (`upload-part-validation`, `payment-group-utils`). Student-payments report shell, ResourceTable, and Glide grid are forbidden. Upload form keeps per-part description/remarks (Jul 11); validation remains pure and test-first. Coverage review preserves its semantic `DESIGN.md` tokens and temporarily retains `_chrome/table` as a documented bare-table exception because R3 does not introduce a standalone semantic table primitive.

**Tech Stack:** Next.js App Router, `FileDragAndDrop`, Vitest, multipart FormData via `buildMultiPartPaymentFormData`, CSV parse for verification.

**Program spec:** `docs/superpowers/specs/2026-07-12-ui-migration-remediation-program-design.md`  
**Related specs:** `2026-07-10-multipart-student-payments-ocr-design.md`, `2026-07-11-student-payments-original-table-fixes-design.md` (per-part description)  
**Planning baseline SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Dependencies (blocking):** R0–R5 and R11–R13 merged. Finance waves are deliberately serialized even where current file inventories appear disjoint.

---

## Route assignment (R14 owns exactly these)

| Route pattern | Fixture URL | Personas | Viewport / theme |
| --- | --- | --- | --- |
| `/finances/student-payments/upload` | `/finances/student-payments/upload?courseId=1&userId=2&date=2026-07-01T00:00:00.000Z` | Admin `payment.record` | Desktop 1280×800 light + dark |
| `/finances/student-payments/verification-upload` | `/finances/student-payments/verification-upload` | Admin `payment.view_all` | Desktop light |
| `/finances/student-payments/coverage-review` | `/finances/student-payments/coverage-review?courseId=1` | Admin | Desktop light |

---

## Serialized ownership vs R11–R13

| File | R14 | Others |
| --- | --- | --- |
| `src/app/(internal)/finances/student-payments/upload/page.tsx` | **owns** (1271 lines) | forbidden |
| `src/app/(internal)/finances/student-payments/verification-upload/page.tsx` | **owns** | forbidden |
| `src/app/(internal)/finances/student-payments/coverage-review/page.tsx` | **owns** | forbidden |
| `src/lib/finances/upload-part-validation.ts` | **owns** | forbidden |
| `src/lib/finances/payment-group-utils.ts` | **owns** | forbidden |
| `src/lib/finances/synthetic-payment-stub.ts` | read-only | R12 owns table stub create |
| `student-payments-report-shell.tsx` | **forbidden** | R12/R13 |

**Order:** R14 starts only after R13 merges. This keeps finance execution consistent with the orchestration gate and ensures upload redirects are verified against the final shared report shell.

---

## Forbidden files (R14)

- `src/components/finances/student-payments-report-shell.tsx`
- `src/components/finances/student-payments-resource-table.tsx`
- `src/components/finances/student-payments-grid.tsx`
- `src/app/(internal)/finances/recent-transactions/page.tsx`
- `src/components/data-table/resource-table.tsx`

---

## Evidence / current behavior (`05ac447b`)

### `upload/page.tsx` (1271 lines)

- Lines 40–52: `UploadPart` includes per-part `description`, `remarks` (Jul 11 `8bf1256d`).
- Lines 24–29: Uses `validateUploadForm`, `scrollToFirstUploadError`.
- Lines 21–23: `buildMultiPartPaymentFormData`, `sumPartAmounts` from `payment-group-utils`.
- Layout: multi-part blocks with OCR status per part; plan mode radio (`single_month`, `multiple_months`, `installment`).
- Defects: mixed legacy `Label` from `@/app/_chrome/label`; field widths may use pre-R4 caps; `data-field-name` attributes required for scroll targeting must exist on every validated control.

### `upload-part-validation.ts` (218 lines)

- Complete pure validation: parts, duplicate txn IDs, plan modes, OCR loading gate (`formOcrLoading`).
- `scrollToFirstUploadError` uses `[data-field-name="${fieldName}"]` selector.

### `verification-upload/page.tsx` (104 lines)

- CSV-only upload; `parseCsv` → `verify-screenshots` POST; minimal layout (`text-lg font-bold` title, no R5 `PageHeader`).
- Uses `useToast` legacy title/description shape.

### `coverage-review/page.tsx` (373 lines)

- Already uses semantic `text-text-primary`, `text-text-secondary`, `text-text-muted`, and `bg-surface`; these tokens must not be converted back to legacy shadcn vocabulary.
- Table comes from `@/app/_chrome/table`; until a standalone semantic bare-table primitive exists, record this import as an explicit tracked exception. Coverage description uses `describePaymentCoverageDisplay` — preserve semantics.
- Delete payment mutation — destructive; staging only.

### Jul 11 commits

- `13d61064` flatten helpers, per-part description remarks
- `8bf1256d` attach description and remarks to each upload screenshot

---

## File structure

| File | Action |
| --- | --- |
| `src/lib/finances/upload-part-validation.ts` | Modify — layout field names export |
| `src/lib/finances/upload-part-validation.test.ts` | Modify |
| `src/lib/finances/upload-form-layout.ts` | Create — section class helpers |
| `src/lib/finances/upload-form-layout.test.ts` | Create |
| `src/lib/finances/payment-group-utils.ts` | Modify — assert per-part keys |
| `src/lib/finances/payment-group-utils.test.ts` | Modify |
| `src/app/(internal)/finances/student-payments/upload/page.tsx` | Modify |
| `src/app/(internal)/finances/student-payments/verification-upload/page.tsx` | Modify |
| `src/app/(internal)/finances/student-payments/coverage-review/page.tsx` | Modify |

---

## Stop conditions

1. Fix requires editing report table/grid — stop; defer to R12/R13.
2. Backend rejects screenshot-optional create — report blocker; do not weaken validation.
3. OCR endpoint unavailable in staging — block upload OCR manual tests; unit tests still pass.

## Rollback / data safety

- Upload POST creates real `UserPayment` / group rows — staging fixtures only.
- `verify-screenshots` triggers async verification job — do not submit production CSVs.
- `deleteEntity` on coverage review is irreversible — QA uses disposable rows.

---

### Task 1: Upload form layout helpers (TDD)

**Files:**
- Create: `src/lib/finances/upload-form-layout.ts`
- Create: `src/lib/finances/upload-form-layout.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  uploadPartSectionClassName,
  uploadPartFieldDataName,
} from "./upload-form-layout";

describe("uploadPartFieldDataName", () => {
  it("matches validateUploadForm field names for screenshot", () => {
    expect(uploadPartFieldDataName("part-a", "screenshot")).toBe("screenshot-part-a");
  });
});

describe("uploadPartSectionClassName", () => {
  it("returns bordered stack with full width min-w-0", () => {
    expect(uploadPartSectionClassName()).toContain("min-w-0");
    expect(uploadPartSectionClassName()).toContain("rounded-xl");
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npm run test:unit -- src/lib/finances/upload-form-layout.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { PartFieldKey } from "./upload-part-validation";
import { fieldNameForPartField } from "./upload-part-validation";

export function uploadPartFieldDataName(
  partKey: string,
  field: PartFieldKey,
): string {
  return fieldNameForPartField(partKey, field);
}

export function uploadPartSectionClassName(): string {
  return "flex w-full min-w-0 flex-col gap-4 rounded-xl border border-border bg-background p-4 shadow-sm";
}

export function uploadFormActionsClassName(): string {
  return "sticky bottom-0 z-sticky flex w-full flex-wrap items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm";
}
```

- [ ] **Step 4: PASS + commit**

```bash
git add src/lib/finances/upload-form-layout.ts src/lib/finances/upload-form-layout.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): upload form layout class and field name helpers

EOF
)"
```

---

### Task 2: Strengthen upload validation tests for layout contract

**Files:**
- Modify: `src/lib/finances/upload-part-validation.test.ts`

- [ ] **Step 1: Add OCR loading gate test**

```ts
it("validateUploadForm sets form error when OCR loading", () => {
  const result = validateUploadForm({
    parts: [
      {
        key: "p1",
        hasFile: true,
        parsedAmount: "100",
        paymentMethodId: "1",
        transactionId: "A",
      },
    ],
    partKeys: ["p1"],
    hasOcrLoading: true,
    isValidPaymentMethodId: () => true,
    paymentPlan: DefaultStudentPaymentPlan.single_month,
    multipleMonthsSelectedCount: 0,
    installmentThroughKey: "",
    selectableMonthKeys: [],
  });
  expect(result.errors.form).toBe(UPLOAD_PART_ERROR_MESSAGES.formOcrLoading);
  expect(result.firstErrorFieldName).toBe("upload-form-error");
});
```

- [ ] **Step 2: Run — PASS**

Run: `npm run test:unit -- src/lib/finances/upload-part-validation.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/finances/upload-part-validation.test.ts
git commit -m "$(cat <<'EOF'
test(finances): cover OCR loading gate in upload validation

EOF
)"
```

---

### Task 3: Per-part FormData keys (description + remarks)

**Files:**
- Modify: `src/lib/finances/payment-group-utils.ts`
- Modify: `src/lib/finances/payment-group-utils.test.ts`

- [ ] **Step 1: Failing test for per-part description**

```ts
it("appendPartToFormData includes description and remarks per part index", () => {
  const fd = new FormData();
  appendPartToFormData(fd, 0, {
    file: new File(["x"], "a.png", { type: "image/png" }),
    parsedAmount: "50",
    paymentMethodId: "3",
    transactionId: "TX1",
    description: "fee",
    remarks: "note",
  });
  expect(fd.get("description-0")).toBe("fee");
  expect(fd.get("remarks-0")).toBe("note");
});
```

- [ ] **Step 2: Run — FAIL then implement in payment-group-utils**

Ensure `buildMultiPartPaymentFormData` appends `description-${i}` and `remarks-${i}` matching backend contract from Jul 11.

- [ ] **Step 3: PASS**

Run: `npm run test:unit -- src/lib/finances/payment-group-utils.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/finances/payment-group-utils.ts src/lib/finances/payment-group-utils.test.ts
git commit -m "$(cat <<'EOF'
fix(finances): per-part description and remarks in multipart FormData

EOF
)"
```

---

### Task 4: Upload page layout + data-field-name wiring

**Files:**
- Modify: `src/app/(internal)/finances/student-payments/upload/page.tsx`

- [ ] **Step 1: PageHeader + back link**

```tsx
import { PageHeader } from "@/components/layout/page-header";
import { uploadPartSectionClassName, uploadPartFieldDataName, uploadFormActionsClassName } from "@/lib/finances/upload-form-layout";

<PageHeader
  title="Upload payment"
  description="Add one or more screenshots for a student payment."
  leading={
    <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <NavArrowLeft className="size-4" aria-hidden />
      Student payments
    </Link>
  }
/>
```

- [ ] **Step 2: Each part section uses layout helper**

At baseline lines 971–977, replace the complete opening `div` element with an opening `section` whose exact attributes are `key={part.key}`, `className={uploadPartSectionClassName()}`, `aria-labelledby={`upload-part-${part.key}-title`}`, and `aria-busy={isPartOcrLoading || undefined}`. Replace the matching closing `</div>` at baseline line 1210 with `</section>`. Change the part heading at baseline line 981 to:

```tsx
<h2
  id={`upload-part-${part.key}-title`}
  className="text-sm font-medium"
>
  Part {index + 1}
</h2>
```

- [ ] **Step 3: Wire field-name helpers and full-width controls**

Make these exact line-level substitutions in the existing complete `Field.Root` blocks; do not replace their children:

1. In the screenshot block, replace both `` `screenshot-${part.key}` `` expressions used by `name` and `data-field-name` with `uploadPartFieldDataName(part.key, "screenshot")`.
2. In the payment-method block, replace both `` `payment-method-${part.key}` `` expressions with `uploadPartFieldDataName(part.key, "paymentMethodId")`.
3. In the transaction-ID block, replace both `` `transaction-id-${part.key}` `` expressions with `uploadPartFieldDataName(part.key, "transactionId")`.
4. In the amount block, replace both `` `amount-${part.key}` `` expressions with `uploadPartFieldDataName(part.key, "parsedAmount")`.
5. Change the existing screenshot `FileDragAndDrop` class from `className="w-full"` to `className="w-full min-w-0"`.
6. Change the payment-method combobox container from `containerClassName="w-full"` to `containerClassName="w-full min-w-0"`.
7. Add `className="h-9 w-full min-w-0"` to the existing Transaction ID input.
8. Change the Amount input class from `className="pr-14"` to `className="h-9 w-full min-w-0 pr-14"`.
9. Add `className="h-9 w-full min-w-0"` to each existing Date on screenshot, Description, and Remarks input. Preserve their existing `value`, `disabled`, and `onChange` props exactly.

- [ ] **Step 4: Submit handler preserves validateUploadForm + scroll**

```ts
const validation = validateUploadForm({
  parts: parts.map((part) => ({
    key: part.key,
    hasFile: Boolean(getLocalFile(part)),
    parsedAmount: part.parsedAmount,
    paymentMethodId: part.paymentMethodId,
    transactionId: part.transactionId,
  })),
  partKeys: parts.map((part) => part.key),
  hasOcrLoading,
  isValidPaymentMethodId: isValidApiEntityIdParam,
  paymentPlan,
  multipleMonthsSelectedCount: selectedMonths.size,
  installmentThroughKey,
  selectableMonthKeys,
});

if (validation.hasErrors) {
  setFieldErrors(validation.errors);
  scrollToFirstUploadError(validation.firstErrorFieldName);
  return;
}

setFieldErrors({ parts: {} });
```

- [ ] **Step 5: Money semantics**

`sumPartAmounts` displays total using `formatMoney` with tenant symbol; parsed amounts remain strings until API boundary (no float accumulation).

- [ ] **Step 6: Manual QA**

1. Submit empty form — scrolls to first missing screenshot.
2. Duplicate txn across parts — error on second part txn field.
3. OCR loading — submit blocked with form-level message.
4. Multi-part 2 screenshots — description/remarks per part in network FormData.
5. Screenshots: `docs/superpowers/evidence/r14-upload-single-part.png`, `r14-upload-multi-part.png`, `r14-upload-validation-error.png`

- [ ] **Step 7: Commit**

```bash
git add src/app/(internal)/finances/student-payments/upload/page.tsx
git commit -m "$(cat <<'EOF'
fix(finances): upload page layout validation wiring and per-part fields

EOF
)"
```

---

### Task 5: Verification CSV upload page

**Files:**
- Modify: `src/app/(internal)/finances/student-payments/verification-upload/page.tsx:76-100`

- [ ] **Step 1: R5 page structure**

```tsx
<PageContainer width="wide" className="space-y-6">
  <PageHeader
    title="Verify payments from CSV"
    description="Upload a CSV with transaction-id and credit columns. First row must be headers."
  />
  <CsvToTable {...screenshotVerificationExample} />
  <div className="max-w-xl min-w-0 space-y-4">
    <FileDragAndDrop
      label="Upload a CSV file"
      files={files}
      setFiles={setFiles}
      maxFiles={1}
    />
    <Button
      isLoading={verifyMutation.isPending}
      type="button"
      onClick={onSubmit}
      disabled={files.length === 0}
      className="active:scale-[0.98]"
    >
      Submit verification
    </Button>
  </div>
</PageContainer>
```

- [ ] **Step 2: Preserve parseCsv money parsing**

```ts
amount: parseFloat(r.credit.trim().replaceAll(",", "")),
```

Do not alter CSV column names `transaction-id`, `credit`.

- [ ] **Step 3: Manual** — invalid CSV shows toast; valid triggers success redirect to `/finances/student-payments`.

Screenshot: `docs/superpowers/evidence/r14-verification-upload.png`

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/finances/student-payments/verification-upload/page.tsx
git commit -m "$(cat <<'EOF'
fix(finances): verification CSV upload page composition

EOF
)"
```

---

### Task 6: Coverage review token alignment + table overflow

**Files:**
- Modify: `src/app/(internal)/finances/student-payments/coverage-review/page.tsx:137-350`
- Modify: `docs/superpowers/specs/ui-remediation-exceptions.md`

- [ ] **Step 1: Preserve DESIGN.md tokens and record the bare-table exception**

Do not replace `text-text-primary`, `text-text-secondary`, `text-text-muted`, or `bg-surface`. Append this exact entry to `docs/superpowers/specs/ui-remediation-exceptions.md`:

```md
## R14 coverage-review bare table

- Consumer: `src/app/(internal)/finances/student-payments/coverage-review/page.tsx`
- Temporary dependency: `@/app/_chrome/table`
- Reason: the page needs semantic native table markup; R3 contracts cover TanStack `ResourceTable` and do not provide a standalone bare-table primitive.
- Containment: the route supplies DESIGN.md text/surface classes and an explicit horizontal-overflow wrapper; no new `_chrome/table` consumers are allowed.
- Removal owner: the first plan that introduces a DESIGN.md standalone bare-table primitive.
- Verification: R14 manual QA plus the R1 legacy-import inventory.
```

- [ ] **Step 2: Table wrapper overflow**

At baseline line 274, replace only the table wrapper opening tag:

```tsx
<div className="min-w-0 overflow-x-auto rounded-lg border">
```

Keep the complete existing `Table`, `TableHeader`, `TableBody`, mapped rows, coverage formatter, actions, and closing wrapper in place.

- [ ] **Step 3: Preserve status strings from API** — display `row.status` verbatim (backend vocabulary).

- [ ] **Step 4: Months covered cell** — keep `describePaymentCoverageDisplay` unchanged.

- [ ] **Step 5: Manual** `/finances/student-payments/coverage-review?courseId=1`

Screenshot: `docs/superpowers/evidence/r14-coverage-review.png`

- [ ] **Step 6: Commit**

```bash
git add src/app/(internal)/finances/student-payments/coverage-review/page.tsx docs/superpowers/specs/ui-remediation-exceptions.md
git commit -m "$(cat <<'EOF'
fix(finances): coverage review tokens and table overflow

EOF
)"
```

---

## Final verification

```bash
npm run lint && npm run typecheck && npm run test:unit && npm run build
npm run test:browser -- --grep "R14 upload"
```

**Worker-only (local implementation aid — not QA signoff):** the `--grep "R14 upload"` subset above narrows browser coverage during development; independent QA must run the full `npm run test:browser` gate.

Expected: all exit 0.

No `test.skip`, `describe.skip`, `it.skip`, CLI skip flag, test exclusion, or omitted browser project is acceptable.

---

## Independent QA prompt (paste-ready)

```
Independent QA — R14 Payment Upload and Verification

Repo: schedjuice-reimagined-fe
Plan: docs/superpowers/plans/2026-07-12-ui-remediation-r14-payment-upload-verification.md
Do NOT patch code.

Routes:
1. /finances/student-payments/upload?courseId=<id>&userId=<id>&date=2026-07-01T00:00:00.000Z
2. /finances/student-payments/verification-upload
3. /finances/student-payments/coverage-review?courseId=<id>

Persona: admin with payment.record / payment.view_all on staging only.

Acceptance:
- Upload: empty submit scrolls to first invalid field; duplicate txn IDs flagged; OCR in-flight blocks submit; per-part description/remarks present in FormData; multipart total equals sum of part amounts.
- Verification: CSV example visible; invalid file shows error toast; valid file starts verification and navigates to student payments.
- Coverage review: multi-month rows render; edit coverage dialog opens; delete confirm works; months covered text matches describePaymentCoverageDisplay semantics.
- No horizontal document overflow at 1280px; light+dark on upload route.
- Screenshots required for all three routes.

Commands (full gate required — skipped/focused/grep subsets are not acceptable for QA signoff):
npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:browser

Return pass/fail with evidence paths and whether failure blocks R12/R13 (report) or R14 only.
```

---

## Spec coverage self-review

| Requirement | Task |
| --- | --- |
| Upload validation | 2, 4 |
| Per-part description | 3, 4 |
| Layout/overflow | 1, 4, 6 |
| Verification CSV | 5 |
| Money semantics | 3, 4 |
| Disjoint from R12/R13 | Forbidden files |
