# R0 — Verification Baseline and Browser Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the repository’s failing unit-test and typecheck baseline, replace the deprecated lint entrypoint, add maintained `typecheck` and Playwright browser commands, and document a single verification gate set — without hiding or excluding existing failures.

**Architecture:** Fix deterministic test-environment gaps first (Vitest polyfills, env defaults, import boundaries), then repair each failing assertion against current production behavior, then add Playwright with real `/login` UI authentication, cookie storage state, prerequisite preflight, and geometry-focused smoke specs for representative/high-risk routes. All gates run from `package.json` scripts and are recorded in contributor docs.

**Tech Stack:** Vitest 3, TypeScript 5.0.4, ESLint 8 (`eslint-config-next`), Playwright 1.41+, Next.js 15 App Router.

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md) §9  
**Planning base SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Branch:** `remediate/ui-r0-verification` from `05ac447b`  
**Blocks:** R1–R16 (no UI contract or route repair may start until R0 merges)

---

## Current baseline evidence (pinned SHA `05ac447b`)

| Gate | Command (today) | Result |
| --- | --- | --- |
| Unit tests | `npm run test:unit` | **7 failed files**, 226 passed; **6 failed tests**, 1,243 passed |
| Typecheck | `npx tsc --noEmit` | **14 errors** in **8 test files** (no `typecheck` script) |
| Lint | `npm run lint` (`next lint`) | Passes with **5 warnings** (2 image, 3 combobox ARIA); command is **deprecated** |
| Build | `npm run build` | Not re-run in planning; required before R0 closes |
| Browser | — | **No Playwright config or scripts** |

### Failing Vitest files and root causes

| File | Failure mode | Root cause |
| --- | --- | --- |
| `src/helpers/intake-course-dates.test.ts` | Suite crash | `src/helpers/intake-course-dates.ts:1` imports `getDateISOString` from `src/helpers/date.ts:16`, which loads `mm-cal-js` UMD expecting `self` |
| `src/helpers/intake-generation-defaults.test.ts` | Suite crash | Same `date.ts` → `mm-cal-js` chain via `src/helpers/intake-generation-defaults.ts:1` |
| `src/components/scheduling/program-create-mode-choice.test.ts` | Suite crash | Test imports `src/components/scheduling/program-create-mode-choice.tsx`, pulling `EntityCombobox` → `src/lib/api.ts:15` which throws without `NEXT_PUBLIC_BASE_API_URL` |
| `src/config/course-record-nav.test.ts:79-83` | 1 assertion | `isCourseHubRoute` (`src/config/course-record-nav.ts:143-157`) returns `true` for nested hub paths; test expects `false` |
| `src/lib/posthog.test.ts:87-94` | 1 assertion | Test expects removed `batch_events: true`; `src/lib/posthog.ts:45-51` no longer passes it |
| `src/helpers/attendance-marking-sort.test.ts:101-110` | 1 assertion | `compareEnrollment` (`src/helpers/attendance-marking-sort.ts:47-49`) ignores `is_removed`; test expects active-before-dropped |
| `src/components/microsoft/microsoft-status-chip.test.ts:5-44` | 3 assertions | Tests expect legacy shadcn variants (`default`, `destructive`, `outline`); implementation (`src/components/microsoft/microsoft-status-chip.tsx:14-67`) uses `primary`, `danger`, `secondary` |

### Typecheck errors (all in `*.test.ts`)

| File | Lines | Error |
| --- | --- | --- |
| `src/components/attendance/attendance-save-payload.test.ts` | 7, 102 | `as attendanceType["user"]` / `as attendanceType` casts too narrow |
| `src/helpers/course-status-actions.test.ts` | 171 | `as accountType` cast too narrow |
| `src/helpers/form.test.ts` | 204-205, 238, 245 | `FieldError` shape; implicit `any` on mock `container`/`input` |
| `src/lib/chat/chat-attachment-contracts.test.ts` | 68, 79 | Extra properties on `Pick<ChatAttachmentRef, "name" \| "mime_type">` |
| `src/lib/imports/commit-payload.test.ts` | 86 | `date_of_birth` missing from `CommitRow` (`src/app/client-api/imports.ts:153-161`) |
| `src/lib/imports/remap-source-rows.test.ts` | 47, 76 | `sheet_names` / `active_sheet` vs `sheetNames` / `activeSheet` |
| `src/lib/user-checkin-mutation.test.ts` | 7, 18 | Mock missing `AxiosResponse` fields |

---

## Forbidden scope

Do **not** modify in R0:

- `src/app/globals.css`, `DESIGN.md`, overlay z-index values, or any primitive styling
- Route pages, finance/student-payments UI, or `sj-content-reset` usage
- Weakening test assertions, adding `.skip`, or excluding failing files from Vitest
- Backend API contracts

Stop and report (do not patch around) if:

- Full `npm run test:unit` still reports any failure after your claimed fix
- `npm run typecheck` reports any error
- Playwright auth cannot obtain a session with documented env + running backend
- `npm run build` fails

---

## File structure (create / modify)

```
vitest.config.mts                         # MODIFY: Vitest project config + env defaults
vitest.setup.ts                           # Loads polyfill before tests
vitest.polyfill.cjs                       # MODIFY: add globalThis.self
playwright.config.ts                      # Browser harness
e2e/global-setup.ts                       # Auth storage state
e2e/preflight.ts                          # Backend/auth/fixture prerequisite checks
e2e/reporters/no-skips.ts                 # Makes any skipped browser test fail the run
e2e/fixtures/auth.ts                      # Authenticated test fixture
e2e/fixtures/theme.ts                     # Theme cookie helper
e2e/smoke/no-horizontal-overflow.spec.ts
e2e/smoke/overlay-select.spec.ts
e2e/smoke/dialog-focus-trap.spec.ts
scripts/verify-all.sh                     # Single verification gate runner
docs/VERIFICATION.md                      # Contributor gate documentation
package.json                              # scripts: typecheck, lint, test:browser, verify
AGENTS.md                                 # Update gate commands
src/components/scheduling/program-create-mode-choice-logic.ts  # Pure helper extraction
```

---

### Task 1: Worktree and baseline capture

**Files:**
- Create: branch `remediate/ui-r0-verification`

- [ ] **Step 1: Create worktree from planning base**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git fetch origin
git worktree add ../worktrees/ui-r0-verification -b remediate/ui-r0-verification 05ac447b
cd ../worktrees/ui-r0-verification
```

- [ ] **Step 2: Record baseline output**

```bash
npm run test:unit 2>&1 | tee /tmp/r0-baseline-vitest.txt
npx tsc --noEmit 2>&1 | tee /tmp/r0-baseline-tsc.txt
npm run lint 2>&1 | tee /tmp/r0-baseline-lint.txt
```

Expected: Vitest shows 7 failed files; tsc shows 14 errors; lint exits 0 with warnings.

- [ ] **Step 3: Commit baseline artifacts note**

```bash
git commit --allow-empty -m "chore(r0): record verification baseline at 05ac447b"
```

---

### Task 2: Vitest environment — `self` polyfill and config

**Files:**
- Modify: `vitest.polyfill.cjs:1-6`
- Create: `vitest.setup.ts`
- Modify: `vitest.config.mts`
- Modify: `package.json` (`test:unit` script, devDependencies)

- [ ] **Step 1: Install DOM testing dependencies**

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event happy-dom --legacy-peer-deps
```

- [ ] **Step 2: Extend polyfill for `mm-cal-js`**

```javascript
// vitest.polyfill.cjs — full file after edit
const { webcrypto } = require("node:crypto");

if (!globalThis.crypto?.getRandomValues) {
  globalThis.crypto = webcrypto;
}

if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}
```

- [ ] **Step 3: Create setup file**

```typescript
// vitest.setup.ts
import "./vitest.polyfill.cjs";
```

- [ ] **Step 4: Update existing Vitest config**

Replace `vitest.config.mts` with (preserve alias, jsx, and include globs; add setup, env, and per-suffix environments):

```typescript
// vitest.config.mts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NEXT_PUBLIC_BASE_API_URL: "http://localhost:8000/api/v1",
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["**/*.test.tsx", "happy-dom"],
      ["**/*.test.ts", "node"],
    ],
  },
});
```

- [ ] **Step 5: Point `test:unit` at config**

In `package.json` scripts, replace:

```json
"test:unit": "NODE_OPTIONS='-r ./vitest.polyfill.cjs' vitest run"
```

with:

```json
"test:unit": "vitest run --config vitest.config.mts"
```

- [ ] **Step 6: Run previously crashing suites**

```bash
npm run test:unit -- src/helpers/intake-course-dates.test.ts src/helpers/intake-generation-defaults.test.ts
```

Expected: PASS (suites collect and run; no `self is not defined`).

- [ ] **Step 7: Commit**

```bash
git add vitest.polyfill.cjs vitest.setup.ts vitest.config.mts package.json package-lock.json
git commit -m "fix(r0): stabilize vitest env for mm-cal-js and API URL"
```

---

### Task 3: Extract pure scheduling helper (fix import-chain crash)

**Files:**
- Create: `src/components/scheduling/program-create-mode-choice-logic.ts`
- Modify: `src/components/scheduling/program-create-mode-choice.tsx:123-129`
- Modify: `src/components/scheduling/program-create-mode-choice.test.ts:1-2`

- [ ] **Step 1: Create pure module**

```typescript
// src/components/scheduling/program-create-mode-choice-logic.ts
import {
  CourseCreationMethod,
  SubjectStrategy,
  type programType,
} from "@/types/program";

export function shouldShowProgramCreateModeChoice(program: programType): boolean {
  return (
    program.course_creation_method === CourseCreationMethod.intake_based &&
    (program.subject_strategy === SubjectStrategy.required ||
      program.subject_strategy === SubjectStrategy.multi)
  );
}
```

- [ ] **Step 2: Re-export from component file**

In `src/components/scheduling/program-create-mode-choice.tsx`, replace lines 123-129 with:

```typescript
export { shouldShowProgramCreateModeChoice } from "./program-create-mode-choice-logic";
```

Add import at top of the component file is not needed for the function body — remove the inline function definition entirely.

- [ ] **Step 3: Point test at pure module**

```typescript
// src/components/scheduling/program-create-mode-choice.test.ts — line 2
import { shouldShowProgramCreateModeChoice } from "./program-create-mode-choice-logic";
```

- [ ] **Step 4: Run test**

```bash
npm run test:unit -- src/components/scheduling/program-create-mode-choice.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/scheduling/program-create-mode-choice-logic.ts \
  src/components/scheduling/program-create-mode-choice.tsx \
  src/components/scheduling/program-create-mode-choice.test.ts
git commit -m "fix(r0): isolate program create mode pure helper from API import chain"
```

---

### Task 4: Fix `isCourseHubRoute` nested-path rejection

**Files:**
- Modify: `src/config/course-record-nav.ts:143-157`
- Test: `src/config/course-record-nav.test.ts:79-83`

- [ ] **Step 1: Write failing test confirmation**

```bash
npm run test:unit -- src/config/course-record-nav.test.ts -t "rejects sub-routes"
```

Expected: FAIL — `/courses/42/attendance/marking/1` returns `true`.

- [ ] **Step 2: Fix implementation**

Replace `src/config/course-record-nav.ts` lines 143-157 with:

```typescript
export function isCourseHubRoute(pathname: string, courseId: string): boolean {
  const base = `/courses/${courseId}`;
  if (!pathname.startsWith(base)) {
    return false;
  }
  const tail = pathname.slice(base.length).replace(/^\//, "");
  if (!tail) {
    return true;
  }
  const segments = tail.split("/").filter(Boolean);
  if (segments.length !== 1) {
    return false;
  }
  return HUB_SEGMENTS.has(segments[0]);
}
```

- [ ] **Step 3: Run test file**

```bash
npm run test:unit -- src/config/course-record-nav.test.ts
```

Expected: PASS (all tests in file).

- [ ] **Step 4: Commit**

```bash
git add src/config/course-record-nav.ts
git commit -m "fix(r0): reject nested paths in isCourseHubRoute"
```

---

### Task 5: Fix enrollment sort in attendance marking

**Files:**
- Modify: `src/helpers/attendance-marking-sort.ts:47-49`
- Test: `src/helpers/attendance-marking-sort.test.ts:101-110`

- [ ] **Step 1: Confirm failing test**

```bash
npm run test:unit -- src/helpers/attendance-marking-sort.test.ts -t "sorts enrollment active"
```

Expected: FAIL — order `Amy, Ben, Cal, Zara` vs expected `Amy, Cal, Ben, Zara`.

- [ ] **Step 2: Implement enrollment comparator**

Replace `src/helpers/attendance-marking-sort.ts` lines 47-49 with:

```typescript
function compareEnrollment(a: AttendanceRow, b: AttendanceRow): number {
  if (a.is_removed !== b.is_removed) {
    return a.is_removed ? 1 : -1;
  }
  return compareStudentName(a, b);
}
```

- [ ] **Step 3: Run test file**

```bash
npm run test:unit -- src/helpers/attendance-marking-sort.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/helpers/attendance-marking-sort.ts
git commit -m "fix(r0): sort active enrollment before dropped in attendance roster"
```

---

### Task 6: Align PostHog init test with implementation

**Files:**
- Modify: `src/lib/posthog.test.ts:87-94`

- [ ] **Step 1: Confirm failure**

```bash
npm run test:unit -- src/lib/posthog.test.ts -t "initializes posthog"
```

Expected: FAIL — expected `batch_events: true` in init options.

- [ ] **Step 2: Update test expectation**

Replace `src/lib/posthog.test.ts` lines 87-94 with:

```typescript
    expect(mockPostHog.init).toHaveBeenCalledWith("phc_test", {
      api_host: "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: "localStorage+cookie",
    });
```

- [ ] **Step 3: Run test file**

```bash
npm run test:unit -- src/lib/posthog.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/posthog.test.ts
git commit -m "fix(r0): align posthog init test with current options"
```

---

### Task 7: Align Microsoft status chip tests with primitive variants

**Files:**
- Modify: `src/components/microsoft/microsoft-status-chip.test.ts:5-44`

- [ ] **Step 1: Confirm failures**

```bash
npm run test:unit -- src/components/microsoft/microsoft-status-chip.test.ts
```

Expected: FAIL — `primary` vs `default`, `danger` vs `destructive`, `secondary` vs `outline`.

- [ ] **Step 2: Update tests to match `src/components/microsoft/microsoft-status-chip.tsx:14-67`**

Replace `src/components/microsoft/microsoft-status-chip.test.ts` lines 5-44 with:

```typescript
describe("getMicrosoftStatusConfig", () => {
  it("maps linked/created/already_linked to a green positive chip", () => {
    for (const status of ["linked", "already_linked", "created"]) {
      const config = getMicrosoftStatusConfig(status);
      expect(config.label).toBe(
        status === "created" ? "Created" : "Linked",
      );
      expect(config.variant).toBe("primary");
      expect(config.className).toContain("emerald");
    }
  });

  it("maps blocking statuses to danger chips", () => {
    for (const status of [
      "domain_blocked",
      "invalid_domain",
      "missing_license",
      "missing_owner",
      "missing_config",
      "conflict",
      "failed",
    ]) {
      expect(getMicrosoftStatusConfig(status).variant).toBe("danger");
    }
  });

  it("treats invalid_domain and domain_blocked as the same label", () => {
    expect(getMicrosoftStatusConfig("invalid_domain").label).toBe(
      getMicrosoftStatusConfig("domain_blocked").label,
    );
  });

  it("surfaces possible-duplicate guidance for conflicts", () => {
    expect(getMicrosoftStatusConfig("conflict").label).toBe("Possible duplicate");
  });

  it("falls back to the raw status with a secondary chip when unknown", () => {
    const config = getMicrosoftStatusConfig("some_new_backend_status");
    expect(config.label).toBe("some_new_backend_status");
    expect(config.variant).toBe("secondary");
  });
});
```

- [ ] **Step 3: Run test file**

```bash
npm run test:unit -- src/components/microsoft/microsoft-status-chip.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/microsoft/microsoft-status-chip.test.ts
git commit -m "fix(r0): update microsoft status chip tests for DESIGN.md variants"
```

---

### Task 8: Repair typecheck errors in test files

**Files:**
- Modify: `src/app/client-api/imports.ts:153-161`
- Modify: `src/components/attendance/attendance-save-payload.test.ts:5-20,87-102`
- Modify: `src/helpers/course-status-actions.test.ts:165-175`
- Modify: `src/helpers/form.test.ts:200-207,236-252`
- Modify: `src/lib/chat/chat-attachment-contracts.test.ts:64-85`
- Modify: `src/lib/imports/remap-source-rows.test.ts:42-49,71-78`
- Modify: `src/lib/user-checkin-mutation.test.ts:1-20`

- [ ] **Step 1: Extend `CommitRow` for builtin fields**

In `src/app/client-api/imports.ts`, replace lines 153-161 with:

```typescript
export type CommitRow = {
  email: string;
  name?: string;
  phone_number?: string;
  communication_email?: string;
  date_of_birth?: string;
  match_user_id?: number;
  custom_data: Record<string, unknown>;
  course_ids: number[];
};
```

- [ ] **Step 2: Fix attendance save payload fixtures**

In `src/components/attendance/attendance-save-payload.test.ts`, replace the user cast at lines 7-20 with:

```typescript
  user: {
    id: id * 10,
    name: `Student ${id}`,
    email: `student${id}@example.com`,
    alternative_name: null,
    phone_number: null,
  } as attendanceType["user"],
```

Replace line 102 with:

```typescript
    const payload = buildAttendanceSavePayload([rawRow as unknown as attendanceType], [1]);
```

- [ ] **Step 3: Fix course-status-actions admin fixture**

In `src/helpers/course-status-actions.test.ts`, replace lines 171-175 with:

```typescript
  const admin: accountType = {
    id: 2,
    roles: [role.admin],
    permissions: [],
  } as unknown as accountType;
```

- [ ] **Step 4: Fix form.test.ts error shapes and mock types**

In `src/helpers/form.test.ts`, replace lines 203-206 with:

```typescript
          errors: {
            email: { type: "required", message: "Required" },
            name: { type: "required", message: "Required" },
          },
```

Replace lines 238-252 with:

```typescript
    const input: {
      focus: ReturnType<typeof vi.fn>;
      closest: (selector: string) => typeof container | null;
    } = {
      focus: vi.fn(),
      closest: vi.fn((selector: string) =>
        selector === "[data-field-name]" || selector === ".space-y-2"
          ? container
          : null
      ),
    };
    const container: {
      scrollIntoView: ReturnType<typeof vi.fn>;
      matches: ReturnType<typeof vi.fn>;
      querySelector: ReturnType<typeof vi.fn>;
      setAttribute: ReturnType<typeof vi.fn>;
      removeAttribute: ReturnType<typeof vi.fn>;
    } = {
      scrollIntoView: vi.fn(),
      matches: vi.fn(() => false),
      querySelector: vi.fn(() => input),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
```

- [ ] **Step 5: Fix chat attachment contract test args**

In `src/lib/chat/chat-attachment-contracts.test.ts`, replace lines 67-72 and 78-83 with Pick-only objects:

```typescript
      isChatAudioAttachment({
        name: "clip.dat",
        mime_type: "audio/webm",
      })
```

and:

```typescript
      isChatAudioAttachment({
        name: "voice.m4a",
        mime_type: "",
      })
```

- [ ] **Step 6: Fix import store parse fixtures**

In `src/lib/imports/remap-source-rows.test.ts`, replace `sheet_names` / `active_sheet` at lines 47-48 and 76-77 with:

```typescript
        sheetNames: ["Sheet1"],
        activeSheet: "Sheet1",
```

- [ ] **Step 7: Fix Axios mock helper**

Replace full `src/lib/user-checkin-mutation.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import type { AxiosResponse } from "axios";
import { assertSchedjuiceSuccess } from "./schedjuice-api-response";

function mockAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as AxiosResponse<T>["config"],
  };
}

describe("assertSchedjuiceSuccess", () => {
  it("returns data when isError is false", () => {
    const res = mockAxiosResponse({
      isError: false,
      message: "success",
      data: { ok: true },
    });
    expect(assertSchedjuiceSuccess(res)).toEqual({ ok: true });
  });

  it("throws when isError is true even on 200", () => {
    const res = mockAxiosResponse({
      isError: true,
      message: "bad_request",
      details: { message: "No more events to check in for today" },
    });
    expect(() => assertSchedjuiceSuccess(res)).toThrow(/No more events/);
  });
});
```

- [ ] **Step 8: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no output, exit 0. Task 9 adds the `typecheck` package script afterward.

- [ ] **Step 9: Commit**

```bash
git add src/app/client-api/imports.ts \
  src/components/attendance/attendance-save-payload.test.ts \
  src/helpers/course-status-actions.test.ts \
  src/helpers/form.test.ts \
  src/lib/chat/chat-attachment-contracts.test.ts \
  src/lib/imports/remap-source-rows.test.ts \
  src/lib/user-checkin-mutation.test.ts
git commit -m "fix(r0): repair test-only TypeScript errors"
```

---

### Task 9: Replace deprecated lint and add `typecheck` / `verify` scripts

**Files:**
- Modify: `package.json` scripts
- Create: `scripts/verify-all.sh`
- Create: `docs/VERIFICATION.md`
- Modify: `AGENTS.md:9-12`

- [ ] **Step 1: Update `package.json` scripts**

Add and replace in `package.json`:

```json
"lint": "eslint . --ext .js,.jsx,.ts,.tsx",
"typecheck": "tsc --noEmit",
"test:browser": "playwright test",
"verify": "bash scripts/verify-all.sh"
```

- [ ] **Step 2: Create verify-all gate script**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:browser
echo "All verification gates passed."
```

```bash
chmod +x scripts/verify-all.sh
```

- [ ] **Step 3: Create contributor verification doc**

```markdown
# Verification gates (Schedjuice frontend)

Run from repository root after `npm install --legacy-peer-deps`.

| Gate | Command | Expected |
| --- | --- | --- |
| Lint | `npm run lint` | Exit 0; the five pinned baseline warnings remain visible until assigned to a dedicated cleanup plan |
| Typecheck | `npm run typecheck` | Exit 0, no output |
| Unit tests | `npm run test:unit` | All files pass |
| Production build | `npm run build` | Exit 0 |
| Browser smoke | `npm run test:browser` | All specs pass with zero skipped tests (requires dev server, backend, auth, and unique payment fixture text; see `e2e/README.md`) |
| Full gate | `npm run verify` | Runs all of the above |

## Environment

- `NEXT_PUBLIC_BASE_API_URL` must be set (see `.env.example`).
- Browser tests additionally require `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_TEST_EMAIL`, `PLAYWRIGHT_TEST_PASSWORD`, and `PLAYWRIGHT_PAYMENT_FIXTURE_TEXT` (see `e2e/README.md`).

## Policy

Existing failures must be fixed, not skipped or excluded. Later remediation waves may not weaken these gates.
```

Save as `docs/VERIFICATION.md`.

- [ ] **Step 4: Update AGENTS.md running section**

Replace AGENTS.md lines 9-12 with:

```markdown
- **Lint**: `npm run lint` (ESLint CLI)
- **Typecheck**: `npm run typecheck`
- **Unit tests**: `npm run test:unit` (Vitest)
- **Browser smoke**: `npm run test:browser` (Playwright; backend, auth, and unique payment fixture text required)
- **All gates**: `npm run verify`
- **Build**: `npm run build`
```

- [ ] **Step 5: Run lint and typecheck**

```bash
npm run lint
npm run typecheck
```

Expected lint: exit 0 with the same five visible baseline warnings: two `@next/next/no-img-element` warnings and three `jsx-a11y/role-has-required-aria-props` warnings. Any additional warning or any error is a regression and must be fixed before continuing.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/verify-all.sh docs/VERIFICATION.md AGENTS.md
git commit -m "chore(r0): add typecheck script and replace deprecated next lint"
```

---

### Task 10: Full unit test green gate

**Files:**
- Test: all Vitest suites

- [ ] **Step 1: Run full suite**

```bash
npm run test:unit
```

Expected:

```
Test Files  233 passed (233)
     Tests  1249 passed (1249)
```

- [ ] **Step 2: Confirm the task left no uncommitted changes**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If the suite required another code change, stop and add a new explicit task with the failing assertion, complete patch, passing command, and commit before continuing.

---

### Task 11: Playwright harness — install and config

**Files:**
- Modify: `package.json` devDependencies
- Create: `playwright.config.ts`
- Create: `e2e/reporters/no-skips.ts`
- Create: `e2e/README.md`

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test@1.41.2 --legacy-peer-deps
npx playwright install chromium
```

- [ ] **Step 2: Create Playwright config**

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["./e2e/reporters/no-skips.ts"],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-dark",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
      },
    },
  ],
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Create the zero-skip reporter**

```typescript
// e2e/reporters/no-skips.ts
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

class NoSkipsReporter implements Reporter {
  private skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === "skipped") {
      this.skipped.push(test.titlePath().join(" > "));
    }
  }

  onEnd(result: FullResult): { status?: FullResult["status"] } {
    if (this.skipped.length === 0) {
      return { status: result.status };
    }

    console.error(
      `[browser gate] Skipped tests are forbidden:\n${this.skipped
        .map((title) => `- ${title}`)
        .join("\n")}`,
    );
    return { status: "failed" };
  }
}

export default NoSkipsReporter;
```

- [ ] **Step 4: Document browser env in `e2e/README.md`**

```markdown
# Playwright browser suite (R0)

## Required env

| Variable | Required value | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | Next dev server |
| `PLAYWRIGHT_TEST_EMAIL` | `james@schedjuice.com` | JWT login (see AGENTS.md) |
| `PLAYWRIGHT_TEST_PASSWORD` | `password123` | JWT login |
| `NEXT_PUBLIC_BASE_API_URL` | `http://localhost:8000/api/v1` | Backend API |
| `PLAYWRIGHT_PAYMENT_FIXTURE_TEXT` | Unique text from a seeded editable payment row | Locates exactly one row containing an editable status combobox and Delete payment control |

Backend must be running. Tenant resolves via host/`DEV_TENANT_DOMAIN` per AGENTS.md.

## Auth strategy

`e2e/global-setup.ts` logs in through the real `/login` UI so `persistAuthCookies()` creates the same `access`, `refresh`, `account`, role, schema, and session cookies used by production. It then validates the required payment and user fixture routes and controls before writing `e2e/.auth/admin.json`.

If the backend, credentials, permissions, fixture IDs, or controls are missing, global setup throws an actionable error and Playwright runs no specs. Missing prerequisites are a STOP condition, never a skipped or passing browser run.

## Running

```bash
npm run test:browser
```
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e/reporters/no-skips.ts e2e/README.md
git commit -m "chore(r0): add Playwright harness and config"
```

---

### Task 12: Deterministic browser preflight and auth state

**Files:**
- Create: `e2e/global-setup.ts`
- Create: `e2e/preflight.ts`
- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/fixtures/theme.ts`
- Create: `e2e/smoke/authenticated-shell.spec.ts`
- Add to `.gitignore`: `e2e/.auth/`

- [ ] **Step 1: Add gitignore entry**

Append to `.gitignore`:

```
e2e/.auth/
playwright-report/
test-results/
```

- [ ] **Step 2: Create prerequisite preflight**

```typescript
// e2e/preflight.ts
import type { Page } from "@playwright/test";

export type BrowserPrerequisites = {
  baseURL: string;
  apiURL: string;
  email: string;
  password: string;
  paymentFixtureText: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `[browser preflight] Missing ${name}. Set it before running npm run test:browser; see e2e/README.md.`,
    );
  }
  return value;
}

export function readBrowserPrerequisites(baseURL: string): BrowserPrerequisites {
  return {
    baseURL,
    apiURL: requireEnv("NEXT_PUBLIC_BASE_API_URL"),
    email: requireEnv("PLAYWRIGHT_TEST_EMAIL"),
    password: requireEnv("PLAYWRIGHT_TEST_PASSWORD"),
    paymentFixtureText: requireEnv("PLAYWRIGHT_PAYMENT_FIXTURE_TEXT"),
  };
}

export async function assertBackendReachable(
  page: Page,
  prerequisites: BrowserPrerequisites,
): Promise<void> {
  const response = await page.request.get(`${prerequisites.apiURL}/organizations/public`);
  if (!response.ok()) {
    throw new Error(
      `[browser preflight] Backend/tenant probe failed: GET ${prerequisites.apiURL}/organizations/public returned ${response.status()}. Start the backend and verify tenant resolution.`,
    );
  }
}

export async function assertRequiredFixtures(
  page: Page,
  prerequisites: BrowserPrerequisites,
): Promise<void> {
  await page.goto(`${prerequisites.baseURL}/finances/student-payments`);
  await page.waitForLoadState("networkidle");

  const paymentRow = page
    .getByRole("row")
    .filter({ hasText: prerequisites.paymentFixtureText });
  if ((await paymentRow.count()) !== 1) {
    throw new Error(
      `[browser preflight] Expected exactly one payment row containing "${prerequisites.paymentFixtureText}" on /finances/student-payments for ${prerequisites.email}; found ${await paymentRow.count()}. Seed a unique editable row or grant permission before running browser tests.`,
    );
  }
  if ((await paymentRow.locator('[role="combobox"]').count()) < 1) {
    throw new Error(
      `[browser preflight] Payment fixture "${prerequisites.paymentFixtureText}" has no editable status combobox. Use a fixture whose status is editable.`,
    );
  }
  if ((await paymentRow.getByRole("button", { name: "Delete payment" }).count()) !== 1) {
    throw new Error(
      `[browser preflight] Payment fixture "${prerequisites.paymentFixtureText}" has no Delete payment control. Use an account with delete permission.`,
    );
  }
}
```

- [ ] **Step 3: Create global setup**

```typescript
// e2e/global-setup.ts
import fs from "node:fs";
import path from "node:path";
import { chromium, expect, type FullConfig } from "@playwright/test";
import {
  assertBackendReachable,
  assertRequiredFixtures,
  readBrowserPrerequisites,
} from "./preflight";

const authFile = path.join(__dirname, ".auth/admin.json");

async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = String(config.projects[0].use.baseURL);
  const prerequisites = readBrowserPrerequisites(baseURL);
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await assertBackendReachable(page, prerequisites);
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(prerequisites.email);
    await page.getByLabel(/password/i).fill(prerequisites.password);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/home(?:\?|$)/, { timeout: 30_000 });

    const cookies = await context.cookies();
    if (!cookies.some((cookie) => cookie.name === "access")) {
      throw new Error(
        "[browser preflight] Login completed without an access cookie. Verify credentials and the /login response.",
      );
    }

    await assertRequiredFixtures(page, prerequisites);
    await expect(page.locator("body")).toBeVisible();
    await context.storageState({ path: authFile });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
```

- [ ] **Step 4: Create authenticated fixture**

```typescript
// e2e/fixtures/auth.ts
import { test as base } from "@playwright/test";
import path from "node:path";

export const test = base.extend({
  storageState: path.join(__dirname, "../.auth/admin.json"),
});

export { expect } from "@playwright/test";
```

- [ ] **Step 5: Create theme helper**

```typescript
// e2e/fixtures/theme.ts
import type { Page } from "@playwright/test";

export async function setTheme(page: Page, theme: "light" | "dark" | "system") {
  await page.context().addCookies([
    {
      name: "theme",
      value: theme,
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}
```

- [ ] **Step 6: Run preflight through Playwright**

Create the authenticated-shell smoke spec:

```typescript
// e2e/smoke/authenticated-shell.spec.ts
import { test, expect } from "../fixtures/auth";

test("authenticated storage opens the internal shell", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/home(?:\?|$)/);
  await expect(page.locator("#main-content")).toBeVisible();
});
```

```bash
export PLAYWRIGHT_TEST_EMAIL=james@schedjuice.com
export PLAYWRIGHT_TEST_PASSWORD=password123
export NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1
: "${PLAYWRIGHT_PAYMENT_FIXTURE_TEXT:?Set this to unique text from a seeded editable payment row}"
npm run test:browser -- e2e/smoke/authenticated-shell.spec.ts
```

Expected: global setup succeeds, authenticated fixture controls are found, and the authenticated-shell spec passes in both configured projects with zero skipped tests. If any prerequisite is absent, expected output begins with `[browser preflight]` and execution stops before a spec runs.

- [ ] **Step 7: Commit**

```bash
git add e2e/global-setup.ts e2e/preflight.ts e2e/fixtures/auth.ts e2e/fixtures/theme.ts e2e/smoke/authenticated-shell.spec.ts .gitignore
git commit -m "feat(r0): add deterministic browser preflight and auth state"
```

---

### Task 13: Browser smoke specs — overflow, select overlay, dialog focus

**Files:**
- Create: `e2e/smoke/no-horizontal-overflow.spec.ts`
- Create: `e2e/smoke/overlay-select.spec.ts`
- Create: `e2e/smoke/dialog-focus-trap.spec.ts`

- [ ] **Step 1: Horizontal overflow spec**

```typescript
// e2e/smoke/no-horizontal-overflow.spec.ts
import { test, expect } from "../fixtures/auth";

const ROUTES = ["/campuses", "/finances/student-payments"];

for (const route of ROUTES) {
  test(`no document horizontal overflow on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });
}
```

- [ ] **Step 2: Select overlay clickability on the preflighted payment row**

```typescript
// e2e/smoke/overlay-select.spec.ts
import { test, expect } from "../fixtures/auth";

test("select listbox is visible and receives click", async ({ page }) => {
  const fixtureText = process.env.PLAYWRIGHT_PAYMENT_FIXTURE_TEXT;
  expect(fixtureText, "PLAYWRIGHT_PAYMENT_FIXTURE_TEXT must be set by preflight").toBeTruthy();

  await page.goto("/finances/student-payments");
  await page.waitForLoadState("networkidle");

  const paymentRow = page.getByRole("row").filter({ hasText: fixtureText! });
  await expect(paymentRow, `payment fixture row "${fixtureText}"`).toHaveCount(1);
  const trigger = paymentRow.locator('[role="combobox"]').first();
  await expect(trigger, "editable payment status combobox").toBeVisible();

  await trigger.click();
  const listbox = page.locator('[role="listbox"]').first();
  await expect(listbox).toBeVisible();

  const box = await listbox.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeGreaterThan(0);
  }

  const topElement = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.getAttribute("role") ?? el?.tagName ?? null;
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });

  expect(topElement === "listbox" || topElement === "option" || topElement === "LISTBOX").toBeTruthy();
});
```

- [ ] **Step 3: Dialog focus trap on the preflighted payment row**

```typescript
// e2e/smoke/dialog-focus-trap.spec.ts
import { test, expect } from "../fixtures/auth";

test("modal traps focus and Escape closes", async ({ page }) => {
  const fixtureText = process.env.PLAYWRIGHT_PAYMENT_FIXTURE_TEXT;
  expect(fixtureText, "PLAYWRIGHT_PAYMENT_FIXTURE_TEXT must be set by preflight").toBeTruthy();

  await page.goto("/finances/student-payments");
  await page.waitForLoadState("networkidle");

  const paymentRow = page.getByRole("row").filter({ hasText: fixtureText! });
  await expect(paymentRow, `payment fixture row "${fixtureText}"`).toHaveCount(1);
  await paymentRow.getByRole("button", { name: "Delete payment" }).click();

  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("This action cannot be undone")).toBeVisible();
  await page.keyboard.press("Tab");
  const focusedInDialog = await dialog.evaluate((node) => node.contains(document.activeElement));
  expect(focusedInDialog).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
```

- [ ] **Step 4: Run browser suite (backend + auth + fixtures required)**

```bash
export PLAYWRIGHT_TEST_EMAIL=james@schedjuice.com
export PLAYWRIGHT_TEST_PASSWORD=password123
export NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1
: "${PLAYWRIGHT_PAYMENT_FIXTURE_TEXT:?Set this to unique text from a seeded editable payment row}"
npm run test:browser
```

Expected: every browser spec passes and Playwright reports `0 skipped`. Any missing prerequisite fails global setup with a `[browser preflight]` message before specs run.

- [ ] **Step 5: Commit**

```bash
git add e2e/smoke/
git commit -m "feat(r0): add browser smoke specs for overflow, select, and dialog focus"
```

---

### Task 14: Production build gate and final verification

**Files:**
- Test: full gate

- [ ] **Step 1: Production build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 2: Confirm browser prerequisites before the full gate**

```bash
npm run test:browser -- e2e/smoke/authenticated-shell.spec.ts
```

Expected: global setup completes, all required fixtures and controls are found, and the authenticated-shell spec passes in both configured projects with zero skipped tests. If preflight fails, STOP R0 execution and provision the reported prerequisite; do not run or claim the completion gate.

- [ ] **Step 3: Run the full verification gate**

```bash
npm run verify
```

Expected: lint, typecheck, unit, build, and browser tests all pass; browser output reports zero failed and zero skipped tests.

- [ ] **Step 4: Confirm the branch is clean**

```bash
git status --short
```

Expected: no output. If files are listed, STOP and assign them to the exact preceding task that owns them before committing.

---

## Manual / browser checks (R0)

| Check | Steps | Evidence |
| --- | --- | --- |
| Lint CLI works | `npm run lint` | Terminal output exit 0 |
| Typecheck script | `npm run typecheck` | No errors |
| Auth storage | Inspect `e2e/.auth/admin.json` after global setup | Contains the `access` cookie and associated session cookies |
| Payment select | Open `/finances/student-payments`, locate `PLAYWRIGHT_PAYMENT_FIXTURE_TEXT`, open its status combobox | Listbox visible, clickable, not clipped |
| Student payments overflow | `/finances/student-payments` at 1280×800 | No horizontal scrollbar on `documentElement` |

---

## R0 completion gate

R0 is complete only when all are true on the merged branch:

1. `npm run lint` — exit 0 with exactly the five pinned baseline warnings and no errors
2. `npm run typecheck` — exit 0
3. `npm run test:unit` — 0 failed files, 0 failed tests
4. `npm run build` — exit 0
5. `npm run test:browser` — all specs pass with zero skipped tests
6. `docs/VERIFICATION.md` and `AGENTS.md` list the same commands
7. No test files excluded from Vitest config
8. Browser preflight validates backend reachability, real UI login cookies, and payment fixture controls; any missing prerequisite stops execution before browser specs

---

## Independent QA prompt (paste-ready)

```
You are an independent QA subagent. Do NOT patch code.

Repository: schedjuice-reimagined-fe
Branch: remediate/ui-r0-verification (merged SHA to verify)
Planning base: 05ac447b

Verify R0 — Verification baseline:

1. Run exactly:
   npm run lint
   npm run typecheck
   npm run test:unit
   npm run build
   npm run test:browser   # requires backend, credentials, and unique payment fixture text

2. Expected:
   - lint: exit 0 with exactly the five pinned baseline warnings and no errors
   - typecheck: exit 0, no output
   - test:unit: 233 files passed, 1249 tests passed (0 failures)
   - build: exit 0
   - test:browser: all specs pass, zero skipped tests

3. Confirm files exist:
   - vitest.config.mts, vitest.setup.ts
   - playwright.config.ts, e2e/global-setup.ts, e2e/preflight.ts, e2e/reporters/no-skips.ts, e2e/fixtures/auth.ts
   - docs/VERIFICATION.md, scripts/verify-all.sh
   - package.json scripts: lint, typecheck, test:browser, verify

4. Confirm policy: no Vitest exclude patterns, Playwright skip calls, or conditional acceptance paths hide failures.

5. Return PASS/FAIL with command output excerpts and suspected owning plan if FAIL.
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-12-ui-remediation-r0-verification-foundation.md`.**
