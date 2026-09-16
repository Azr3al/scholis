# Overnight Sessions — Intake Wizard Follow-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow overnight recurring sessions (e.g. 22:30 → 00:00) in the intake wizard schedule editor, matching calendar/event-form overnight rules already shipped elsewhere.

**Architecture:** Replace the intake wizard’s local same-day-only validator with shared `session-time.ts` helpers. Update slot summary formatting and `RecurringSlotsEditor` error/hint UX to mirror `event-form.tsx` overnight behavior. No backend changes — BE already accepts overnight via `validate_session_time_range`.

**Tech Stack:** Next.js App Router, Vitest (`npm run test:unit`), shared helpers in `src/helpers/session-time.ts`.

**Spec:** `docs/superpowers/specs/2026-07-24-overnight-sessions-design.md` (intake was explicitly out of scope; this plan completes that follow-up).

## Global Constraints

- Overnight convention: `time_to <= time_from` ⇒ end on next calendar day; max span **24 hours**; reject zero duration.
- Silent accept when overnight duration **< 2 hours**; require explicit checkbox confirmation when **≥ 2 hours** (same threshold as `OVERNIGHT_CONFIRM_THRESHOLD_MINUTES` in `session-time.ts`).
- Reuse `isValidSessionTimeRange`, `validateSessionTimeRange`, `isOvernightSession`, `requiresOvernightConfirmation`, `formatSessionTimeRange` — do not duplicate logic in `intake-schedule.ts`.
- Slot error copy: use `validateSessionTimeRange` messages (not hard-coded “End time must be after start time” for overnight-invalid cases).
- Summary labels: show `(+1)` overnight suffix via `formatSessionTimeRange`.
- High-value tests only — assert overnight allowed, long overnight blocked without confirm, summary formatting.
- All FE commands from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/helpers/intake-schedule.ts` | Modify | Delegate validation to `session-time`; overnight-aware summaries |
| `src/helpers/intake-schedule.test.ts` | Modify | Overnight slot tests |
| `src/components/scheduling/intake/recurring-slots-editor.tsx` | Modify | Overnight hint, confirm checkbox, error messages |
| `src/components/scheduling/intake/recurring-slots-editor.test.tsx` | Create | Editor gating for long overnight |

No changes to `create-course-schedule.ts` (already uses `isValidSessionTimeRange`).

---

### Task 1: Intake schedule helpers — overnight validation + summary

**Files:**
- Modify: `src/helpers/intake-schedule.ts`
- Modify: `src/helpers/intake-schedule.test.ts`

**Interfaces:**
- Produces:
  - `isValidRecurringSlot(slot: RecurringSlot): boolean` — uses `isValidSessionTimeRange`
  - `formatRecurringSlotsSummary(slots)` — uses `formatSessionTimeRange` for time label
  - `recurringSlotTimeError(slot: RecurringSlot): string | null` — uses `validateSessionTimeRange`

- [ ] **Step 1: Write the failing tests**

Add to `src/helpers/intake-schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatRecurringSlotsSummary,
  isValidRecurringSlot,
  recurringSlotTimeError,
} from "./intake-schedule";

describe("intake-schedule overnight", () => {
  it("accepts overnight slots within 24h", () => {
    const slot = { weekday: "Mon", time_from: "22:30", time_to: "00:00" };
    expect(isValidRecurringSlot(slot)).toBe(true);
    expect(recurringSlotTimeError(slot)).toBeNull();
  });

  it("rejects zero-duration slots", () => {
    const slot = { weekday: "Mon", time_from: "10:00", time_to: "10:00" };
    expect(isValidRecurringSlot(slot)).toBe(false);
    expect(recurringSlotTimeError(slot)).toMatch(/after start time/i);
  });

  it("formats overnight summary with (+1)", () => {
    expect(
      formatRecurringSlotsSummary([
        { weekday: "Mon", time_from: "22:30", time_to: "00:00" },
      ]),
    ).toContain("(+1)");
  });
});
```

Update the existing test that expects `10:00 → 09:00` to be invalid — change expectation: overnight **within 24h is valid**:

```ts
expect(
  isValidRecurringSlot({
    weekday: "Mon",
    time_from: "10:00",
    time_to: "09:00",
  }),
).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/intake-schedule.test.ts
```

Expected: FAIL — overnight slot rejected; summary missing `(+1)`.

- [ ] **Step 3: Implement helpers**

Replace local `isClassTimeRangeValid` in `src/helpers/intake-schedule.ts`:

```ts
import {
  formatSessionTimeRange,
  isValidSessionTimeRange,
  validateSessionTimeRange,
} from "@/helpers/session-time";

export function recurringSlotTimeError(
  slot: Pick<RecurringSlot, "time_from" | "time_to">,
): string | null {
  return validateSessionTimeRange(slot.time_from, slot.time_to);
}

export function isValidRecurringSlot(slot: RecurringSlot): boolean {
  return (
    weekdayNames.includes(slot.weekday) &&
    isValidSessionTimeRange(slot.time_from, slot.time_to)
  );
}
```

In `formatRecurringSlotsSummary`, replace manual time label:

```ts
const timeLabel = formatSessionTimeRange(
  first.time_from,
  first.time_to,
  formatTimeLabel,
);
```

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/intake-schedule.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/helpers/intake-schedule.ts src/helpers/intake-schedule.test.ts
git commit -m "feat(intake): allow overnight slots in intake schedule helpers"
```

---

### Task 2: RecurringSlotsEditor — overnight hint + long-span confirmation

**Files:**
- Modify: `src/components/scheduling/intake/recurring-slots-editor.tsx`
- Create: `src/components/scheduling/intake/recurring-slots-editor.test.tsx`

**Interfaces:**
- Consumes: `recurringSlotTimeError`, `isOvernightSession`, `requiresOvernightConfirmation` from helpers
- Produces: `recurringSlotsEditorValid(slots, opts?: { overnightConfirmedByIndex?: Record<number, boolean> })`

- [ ] **Step 1: Write the failing test**

Create `recurring-slots-editor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RecurringSlotsEditor,
  recurringSlotsEditorValid,
} from "./recurring-slots-editor";

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { timezone: "Asia/Yangon" } }),
}));

describe("RecurringSlotsEditor overnight", () => {
  it("requires confirmation for long overnight spans", () => {
    const slots = [{ weekday: "Mon", time_from: "20:00", time_to: "06:00" }];
    expect(recurringSlotsEditorValid(slots)).toBe(false);
    expect(
      recurringSlotsEditorValid(slots, { overnightConfirmedByIndex: { 0: true } }),
    ).toBe(true);
  });

  it("shows overnight hint for short overnight slot", () => {
    render(
      <RecurringSlotsEditor
        slots={[{ weekday: "Mon", time_from: "22:30", time_to: "00:00" }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/ends next day/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- src/components/scheduling/intake/recurring-slots-editor.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Implement editor UX**

In `recurring-slots-editor.tsx`:

1. Import `recurringSlotTimeError`, `isOvernightSession`, `requiresOvernightConfirmation` from `@/helpers/intake-schedule` / `@/helpers/session-time`.
2. Add component state: `const [overnightConfirmed, setOvernightConfirmed] = useState<Record<number, boolean>>({})`.
3. Replace `!slotValid` error block:

```tsx
const timeError = recurringSlotTimeError(slot);
const needsConfirm =
  isOvernightSession(slot.time_from, slot.time_to) &&
  requiresOvernightConfirmation(slot.time_from, slot.time_to) &&
  !overnightConfirmed[index];
```

4. Show muted hint when `isOvernightSession(...)`: `Ends next day`.
5. Show `Checkbox` when `requiresOvernightConfirmation(...)`.
6. Update exported validator:

```ts
export function recurringSlotsEditorValid(
  slots: RecurringSlot[],
  opts?: { overnightConfirmedByIndex?: Record<number, boolean> },
): boolean {
  if (slots.length === 0) return true;
  if (!areRecurringSlotsValid(slots)) return false;
  return slots.every((slot, index) => {
    if (!requiresOvernightConfirmation(slot.time_from, slot.time_to)) return true;
    return opts?.overnightConfirmedByIndex?.[index] === true;
  });
}
```

7. Pass `overnightConfirmed` from editor into `course-preview-step` validation — extend `recurringSlotsEditorValid` calls to pass state (lift state to parent if preview step validates without editor mount; simplest: store confirm map in preview step and pass down as props).

- [ ] **Step 4: Wire confirmation state through preview step**

Modify `course-preview-step.tsx` to hold `overnightConfirmedByIndex` state, pass to `RecurringSlotsEditor`, and include in `recurringSlotsEditorValid(slots, { overnightConfirmedByIndex })` checks.

- [ ] **Step 5: Run tests**

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/intake-schedule.test.ts src/components/scheduling/intake/recurring-slots-editor.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/helpers/intake-schedule.ts src/components/scheduling/intake/recurring-slots-editor.tsx src/components/scheduling/intake/recurring-slots-editor.test.tsx src/components/scheduling/intake/course-preview-step.tsx
git commit -m "feat(intake): overnight session UX in recurring slots editor"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Intake wizard smoke**

1. Open intake create flow → course preview step.
2. Add slot `22:30` → `00:00` — should validate; summary shows `(+1)`.
3. Add slot `20:00` → `06:00` — blocked until overnight checkbox checked.
4. Complete intake — events created on course calendar with overnight times.

- [ ] **Step 2: Commit (if any copy tweaks)**

---

## Self-Review

| Spec requirement | Task |
| --- | --- |
| Allow overnight in intake | Task 1–2 |
| < 2h silent accept | Task 2 (no checkbox) |
| ≥ 2h confirm checkbox | Task 2 |
| Summary `(+1)` label | Task 1 |
| Reuse shared helpers | Task 1 |
| No backend changes | — |
