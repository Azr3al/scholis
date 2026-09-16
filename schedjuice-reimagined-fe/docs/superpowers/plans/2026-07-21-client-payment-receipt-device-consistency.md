# Client Payment Receipt Device Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden client-side payment receipt generation so date/time strings use the tenant timezone (English), logo failures degrade silently, and shared blob downloads are more reliable across browsers.

**Architecture:** Keep `@react-pdf/renderer` with A4 pages. Extend receipt payload builders to format clocks via `date-fns-tz` + tenant `timezone`. Probe logo URLs before PDF render and clear them on failure. Harden shared `downloadFile` (drop `target="_blank"`). Call sites already pass full `tenant`; only helper types need `timezone`.

**Tech Stack:** Next.js, `@react-pdf/renderer`, `date-fns-tz`, Vitest, existing `payment-receipt.ts` / `file.tsx`.

## Global Constraints

- Spec: `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-21-client-payment-receipt-device-consistency-design.md`
- FE only — no backend / no server PDF
- `generatedAt`: `MMM d, yyyy, h:mm a zzz` in tenant TZ
- `receiptDate`: `MMM d, yyyy` in tenant TZ (`issued_at` or `now`)
- Missing timezone → `"UTC"`
- Logo probe failure → silent `orgLogoUrl: null`; no logo-only toast
- `downloadFile` signature stays `(url: string, filename: string)`
- Do not create git commits unless the user explicitly asks
- Unit tests: `npm run test:unit -- src/helpers/payment-receipt.test.ts` (and file helper test path as added)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/helpers/payment-receipt.ts` | TZ formatters; expand tenant pick; logo probe; wire into download |
| `src/helpers/payment-receipt.test.ts` | Unit tests for TZ + logo + payload |
| `src/helpers/file.tsx` | Harden `downloadFile` |
| `src/helpers/file.test.ts` | Unit tests for `downloadFile` DOM behavior (create) |
| Call sites (grid / ResourceTable / Payment History) | **No code change expected** — already pass full `tenant` |

---

### Task 1: Tenant-timezone date formatting on receipt payloads

**Files:**
- Modify: `src/helpers/payment-receipt.ts`
- Modify: `src/helpers/payment-receipt.test.ts`

**Interfaces:**
- Consumes: `tenant.timezone?: string`, `date-fns-tz` `formatInTimeZone`, row `issued_at`
- Produces:
  - `resolveReceiptTimezone(timezone?: string | null): string` → timezone or `"UTC"`
  - `formatReceiptDateTime(isoOrDate: string | Date, timezone: string): string` → `MMM d, yyyy, h:mm a zzz`
  - `formatReceiptDate(isoOrDate: string | Date, timezone: string): string` → `MMM d, yyyy`
  - Tenant pick type becomes `Pick<organizationType, "name" | "logo" | "timezone">` on builders / download helpers

- [x] **Step 1: Write the failing tests**
- [x] **Step 2: Run tests to verify they fail**
- [x] **Step 3: Implement formatters and wire into `buildSharedMeta`**
- [x] **Step 4: Run tests to verify they pass** (`26` → timezone suite included)
- [ ] **Step 5: Commit (only if user asked)**

---

### Task 2: Logo probe before PDF generation

**Files:**
- Modify: `src/helpers/payment-receipt.ts`
- Modify: `src/helpers/payment-receipt.test.ts`

**Interfaces:**
- Produces: `resolveLogoForPdf(url, timeoutMs?): Promise<string | null>`
- Download helpers clear logo on failure before `pdf().toBlob()`

- [x] **Step 1: Write the failing tests**
- [x] **Step 2: Run tests to verify they fail**
- [x] **Step 3: Implement probe and wire downloads**
- [x] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit (only if user asked)**

---

### Task 3: Harden shared `downloadFile`

**Files:**
- Modify: `src/helpers/file.tsx`
- Create: `src/helpers/file.test.ts` (`// @vitest-environment happy-dom`)

**Interfaces:**
- Signature unchanged: `(url: string, filename: string)`
- No `target="_blank"`

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement hardened `downloadFile`**
- [x] **Step 4: Run tests to verify they pass** (27 tests across receipt + file)
- [ ] **Step 5: Commit (only if user asked)**

---

### Task 4: Manual smoke + typecheck

- [x] **Step 1: Typecheck / unit suite for touched helpers**
  - Unit: PASS (`payment-receipt.test.ts` + `file.test.ts`)
  - `tsc`: no new errors in `payment-receipt` / `helpers/file` (pre-existing unrelated errors remain)
- [ ] **Step 2: Manual smoke checklist** (for human)
  1. Desktop Chrome: download verified receipt — `Generated at` in tenant TZ
  2. Broken logo → PDF still downloads, org name only
  3. Mobile Safari: download without useless blank tab when practical
- [ ] **Step 3: Commit (only if user asked)**

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Tenant TZ + English for `generatedAt` / `receiptDate` | Task 1 |
| Missing TZ → UTC | Task 1 |
| Logo probe + silent fallback | Task 2 |
| Shared `downloadFile` harden / drop `_blank` | Task 3 |
| Call sites pass timezone via full tenant | Task 1 types; no UI edits needed |
| Errors / toasts unchanged for logo | Task 2 |
| Unit tests + manual smoke | Tasks 1–4 |
| Out of scope (server PDF, ID-card TZ/logo, A4) | Not scheduled |
