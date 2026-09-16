# Simple-first Course Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make weekly course scheduling dead-simple by default (day pickers + one time range, org defaults 19:00 / 90min) with a Custom escape hatch to today’s full editors, plus WD/WE day buttons when `course_type` is in org `course_fields`.

**Architecture:** Add two org fields for defaults. Introduce pure FE helpers that expand/collapse simple state ↔ `RecurringSlot[]` / weekday lists. Ship a shared `SimpleSchedulePicker` that starts in simple mode and swaps in existing editors (`RecurringSlotsEditor`, calendar recurring checkboxes) on Custom. Wire intake preview and calendar event create; no new Event persistence model.

**Tech Stack:** Django + DRF (`Organization` TimeField / PositiveIntegerField), Next.js client components, Vitest, existing `TimeSelect` / primitives, `bun run test:unit`, BE `./scripts/run_backend_tests.sh` with `--keepdb`.

**Spec:** `docs/superpowers/specs/2026-07-18-simple-course-scheduling-design.md`

## Global Constraints

- Simple mode is default for **all** tenants; Custom always available.
- Defaults: start `19:00`, duration `90` minutes; both org-overridable; invalid/missing → FE fallbacks.
- WD = Mon–Thu only; WE = Sat–Sun; Friday only via Custom.
- WE/WD UI when `course_type` ∈ org `course_fields`; picking WD/WE sets days **and** `course_type`.
- Map to existing `RecurringSlot[]` / recurring event payloads — no rrule / schedule-template model.
- Teacher-assign calendar Recurring Mode (`custom` / `weekly` / `all_days`) is out of scope.
- Backend tests must use `--keepdb` via `./scripts/run_backend_tests.sh`.
- Weekday labels stay existing `weekdayNames`: `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `schedjuice-reimagined-be/app_organization/models.py` | Modify | Add `default_session_start_time`, `default_session_duration_minutes` |
| `schedjuice-reimagined-be/app_organization/migrations/0078_organization_default_session_schedule.py` | Create | Migration (number may be next available after 0077) |
| `schedjuice-reimagined-be/app_organization/serializers.py` | Modify | Validate duration ≥ 1 |
| `schedjuice-reimagined-be/app_organization/tests/test_default_session_schedule.py` | Create | Serializer/model defaults + validation |
| `schedjuice-reimagined-fe/src/types/organization.ts` | Modify | Zod fields for the two defaults |
| `schedjuice-reimagined-fe/src/types/course.ts` | Modify | Add `course_type` to `VALID_COURSE_FIELD_NAMES` |
| `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx` | Modify | Field config descriptions for new org settings |
| `schedjuice-reimagined-fe/src/helpers/simple-schedule.ts` | Create | Defaults, WD/WE maps, expand/collapse, mode detection |
| `schedjuice-reimagined-fe/src/helpers/simple-schedule.test.ts` | Create | Unit tests for helpers |
| `schedjuice-reimagined-fe/src/helpers/intake-schedule.ts` | Modify | `createEmptyRecurringSlot` / default factory uses org defaults helper |
| `schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.tsx` | Create | Shared simple/custom UI shell |
| `schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.test.tsx` | Create | Component tests |
| `schedjuice-reimagined-fe/src/components/scheduling/intake/course-preview-step.tsx` | Modify | Use picker for default + per-row slots |
| `schedjuice-reimagined-fe/src/components/scheduling/intake/recurring-slots-editor.tsx` | Modify | Remain as Custom renderer; optional thin re-export |
| `schedjuice-reimagined-fe/src/components/calendar/event-form.tsx` | Modify | Org time defaults; simple day UI when recurring; Custom = current checkboxes |
| `schedjuice-reimagined-fe/src/helpers/intake-generation-defaults.ts` | Modify | Pass `course_type` when WD/WE selected (if not already) |

---

### Task 1: Org default session fields (backend)

**Files:**
- Modify: `schedjuice-reimagined-be/app_organization/models.py` (near `timezone` ~L400)
- Create: `schedjuice-reimagined-be/app_organization/migrations/0078_organization_default_session_schedule.py` (use next number if 0078 taken)
- Modify: `schedjuice-reimagined-be/app_organization/serializers.py` (`OrganizationSerializer.validate`)
- Create: `schedjuice-reimagined-be/app_organization/tests/test_default_session_schedule.py`

**Interfaces:**
- Consumes: `Organization` model, `OrganizationSerializer`
- Produces:
  - `Organization.default_session_start_time: time` default `time(19, 0)`
  - `Organization.default_session_duration_minutes: int` default `90`
  - Both appear on `OrganizationSerializer` / public tenant serializer via `exclude`-based Meta (no field list change needed unless explicitly excluded)

- [ ] **Step 1: Write the failing backend tests**

Create `app_organization/tests/test_default_session_schedule.py`:

```python
from datetime import time

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer


class DefaultSessionScheduleTests(TestCase):
    def test_model_defaults(self):
        org = Organization(name="T", schema_name="t_default_sched")
        self.assertEqual(org.default_session_start_time, time(19, 0))
        self.assertEqual(org.default_session_duration_minutes, 90)

    def test_serializer_rejects_zero_duration(self):
        org = Organization.objects.create(name="T2", schema_name="t_default_sched2")
        ser = OrganizationSerializer(
            org,
            data={"default_session_duration_minutes": 0},
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("default_session_duration_minutes", ser.errors)

    def test_serializer_accepts_custom_defaults(self):
        org = Organization.objects.create(name="T3", schema_name="t_default_sched3")
        ser = OrganizationSerializer(
            org,
            data={
                "default_session_start_time": "18:30:00",
                "default_session_duration_minutes": 60,
            },
            partial=True,
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        ser.save()
        org.refresh_from_db()
        self.assertEqual(org.default_session_start_time, time(18, 30))
        self.assertEqual(org.default_session_duration_minutes, 60)
```

Adjust `Organization.objects.create` kwargs to match whatever required fields existing org tests use (see `tests/test_legacy_organization.py` / `tests/test_platform_org_access.py` for patterns). Prefer copying a working create helper from those tests if `schema_name` alone is insufficient.

- [ ] **Step 2: Run tests — expect FAIL**

Run:

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_default_session_schedule -v 2
```

Expected: FAIL — fields missing on `Organization`.

- [ ] **Step 3: Add model fields**

In `app_organization/models.py`, after `timezone`:

```python
from datetime import time as time_cls  # at module top if not present

default_session_start_time = models.TimeField(
    default=time_cls(19, 0),
    help_text="Default class session start time for simple scheduling UI.",
)
default_session_duration_minutes = models.PositiveIntegerField(
    default=90,
    help_text="Default class session duration in minutes for simple scheduling UI.",
)
```

- [ ] **Step 4: Make migration**

```bash
cd schedjuice-reimagined-be && ./env/bin/python manage.py makemigrations app_organization --name organization_default_session_schedule
```

- [ ] **Step 5: Validate duration in serializer**

In `OrganizationSerializer.validate`, after existing checks:

```python
duration = attrs.get("default_session_duration_minutes")
if duration is None and self.instance is not None:
    duration = getattr(self.instance, "default_session_duration_minutes", None)
if duration is not None and duration < 1:
    raise serializers.ValidationError(
        {
            "default_session_duration_minutes": (
                "Default session duration must be at least 1 minute."
            )
        }
    )
```

(`PositiveIntegerField` already rejects 0 at field level in many cases; keep explicit validate for clear API errors. If field-level already fails `is_valid()`, keep the test asserting the error key.)

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_default_session_schedule -v 2
```

Expected: PASS

- [ ] **Step 7: Commit (BE)**

```bash
cd schedjuice-reimagined-be
git add app_organization/models.py app_organization/migrations/ app_organization/serializers.py app_organization/tests/test_default_session_schedule.py
git commit -m "$(cat <<'EOF'
feat(org): add default session start time and duration settings

EOF
)"
```

---

### Task 2: FE org types, course_type field, settings form

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization.ts`
- Modify: `schedjuice-reimagined-fe/src/types/course.ts` (`VALID_COURSE_FIELD_NAMES`)
- Modify: `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx`
- Create: `schedjuice-reimagined-fe/src/types/course-fields-simple-schedule.test.ts` (assert `course_type` in valid names)

**Interfaces:**
- Consumes: org zod schema, `VALID_COURSE_FIELD_NAMES`
- Produces: typed `default_session_start_time?: string | null`, `default_session_duration_minutes?: number | null` on organization; `course_type` selectable in course fields editor

- [ ] **Step 1: Write failing test for course_type in valid fields**

```typescript
import { describe, expect, it } from "vitest";
import { VALID_COURSE_FIELD_NAMES } from "@/types/course";

describe("VALID_COURSE_FIELD_NAMES", () => {
  it("includes course_type so orgs can enable WD/WE scheduling UI", () => {
    expect(VALID_COURSE_FIELD_NAMES).toContain("course_type");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/types/course-fields-simple-schedule.test.ts
```

Expected: FAIL — `course_type` not in array.

- [ ] **Step 3: Add `course_type` to `VALID_COURSE_FIELD_NAMES`**

In `src/types/course.ts`, append `"course_type"` to the array.

- [ ] **Step 4: Extend organization zod schema**

In `organizationFieldsSchema` (near `timezone`):

```typescript
default_session_start_time: z
  .string()
  .nullable()
  .optional()
  .describe("Default class start time (HH:MM)"),
default_session_duration_minutes: z.coerce
  .number()
  .int()
  .positive()
  .nullable()
  .optional()
  .describe("Default class duration (minutes)"),
```

- [ ] **Step 5: Org form field config**

In `use-org-record-form.tsx` `fieldConfig` (near `timezone`):

```typescript
default_session_start_time: {
  description: "Default start time for new class sessions (simple scheduling).",
},
default_session_duration_minutes: {
  description: "Default length of a class session in minutes (simple scheduling).",
},
```

Ensure these keys are not stripped in owner-edit omit lists unless intentional — they should appear on org owner settings. If `organizationOwnerEditSchema` omits them accidentally via a broad omit, do **not** omit them.

- [ ] **Step 6: Run test — expect PASS**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/types/course-fields-simple-schedule.test.ts
```

- [ ] **Step 7: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/types/organization.ts src/types/course.ts src/types/course-fields-simple-schedule.test.ts src/components/org/record/use-org-record-form.tsx
git commit -m "$(cat <<'EOF'
feat(org): wire session schedule defaults and course_type field

EOF
)"
```

---

### Task 3: Simple-schedule helpers (pure FE)

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/simple-schedule.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/simple-schedule.test.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/intake-schedule.ts` (`createEmptyRecurringSlot`)

**Interfaces:**
- Consumes: `weekdayNames` from `@/components/calendar/types`; `RecurringSlot` from `@/types/intake`
- Produces (exact exports):

```typescript
export const DEFAULT_SESSION_START = "19:00";
export const DEFAULT_SESSION_DURATION_MINUTES = 90;
export const WD_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu"] as const;
export const WE_WEEKDAYS = ["Sat", "Sun"] as const;

export type CourseTypeWdWe = "WD" | "WE";

export type SimpleScheduleValue = {
  weekdays: string[];
  time_from: string; // HH:MM
  time_to: string;   // HH:MM
  course_type: CourseTypeWdWe | null;
};

export type OrgSessionDefaults = {
  default_session_start_time?: string | null;
  default_session_duration_minutes?: number | null;
};

export function normalizeTimeToHhMm(value: string | null | undefined): string;
export function resolveSessionDefaults(org?: OrgSessionDefaults | null): {
  time_from: string;
  time_to: string;
  durationMinutes: number;
};
export function addMinutesToHhMm(start: string, minutes: number): string;
export function orgUsesWdWeNomenclature(courseFields: string[] | null | undefined): boolean;
export function weekdaysForCourseType(type: CourseTypeWdWe): string[];
export function courseTypeForWeekdays(weekdays: string[]): CourseTypeWdWe | null;
export function simpleValueToSlots(value: SimpleScheduleValue): RecurringSlot[];
export function slotsToSimpleValue(slots: RecurringSlot[]): SimpleScheduleValue | null;
export function canCollapseSlotsToSimple(
  slots: RecurringSlot[],
  useWdWe: boolean,
): boolean;
export function createDefaultSimpleValue(org?: OrgSessionDefaults | null): SimpleScheduleValue;
```

Semantics:
- `orgUsesWdWeNomenclature`: `courseFields?.includes("course_type") === true`
- `courseTypeForWeekdays`: exact set match to WD or WE (order-independent); else `null`
- `slotsToSimpleValue`: if empty → `{ weekdays: [], time_from/to from caller defaults not required — return null or empty with empty times? }` — **return** `{ weekdays: [], time_from: "", time_to: "", course_type: null }` only when slots empty; prefer `createDefaultSimpleValue` for UI init. For non-empty: all slots must share same from/to; else `null`.
- `canCollapseSlotsToSimple`: false if empty (open simple with defaults — caller decides); true when shared time and (standard: any weekday subset) or (WD/WE mode: exact WD or WE set). Friday-only → false in WD/WE mode; in standard mode Friday-only **is** simple-capable.
- `simpleValueToSlots`: one slot per weekday in `weekdayNames` order; skip unknown labels.

- [ ] **Step 1: Write failing unit tests**

Create `src/helpers/simple-schedule.test.ts` covering at minimum:

```typescript
import { describe, expect, it } from "vitest";
import {
  WD_WEEKDAYS,
  WE_WEEKDAYS,
  addMinutesToHhMm,
  canCollapseSlotsToSimple,
  courseTypeForWeekdays,
  createDefaultSimpleValue,
  orgUsesWdWeNomenclature,
  resolveSessionDefaults,
  simpleValueToSlots,
  slotsToSimpleValue,
  weekdaysForCourseType,
} from "./simple-schedule";

describe("resolveSessionDefaults", () => {
  it("falls back to 19:00 and 90 minutes", () => {
    expect(resolveSessionDefaults(null)).toEqual({
      time_from: "19:00",
      time_to: "20:30",
      durationMinutes: 90,
    });
  });

  it("uses org overrides", () => {
    expect(
      resolveSessionDefaults({
        default_session_start_time: "18:00:00",
        default_session_duration_minutes: 60,
      }),
    ).toEqual({
      time_from: "18:00",
      time_to: "19:00",
      durationMinutes: 60,
    });
  });
});

describe("WD/WE maps", () => {
  it("maps WD and WE weekdays", () => {
    expect(weekdaysForCourseType("WD")).toEqual([...WD_WEEKDAYS]);
    expect(weekdaysForCourseType("WE")).toEqual([...WE_WEEKDAYS]);
  });

  it("detects exact sets only", () => {
    expect(courseTypeForWeekdays(["Mon", "Tue", "Wed", "Thu"])).toBe("WD");
    expect(courseTypeForWeekdays(["Mon", "Wed"])).toBeNull();
    expect(courseTypeForWeekdays(["Fri"])).toBeNull();
  });
});

describe("expand/collapse", () => {
  it("expands simple value to slots", () => {
    expect(
      simpleValueToSlots({
        weekdays: ["Wed", "Mon"],
        time_from: "19:00",
        time_to: "20:30",
        course_type: null,
      }),
    ).toEqual([
      { weekday: "Mon", time_from: "19:00", time_to: "20:30" },
      { weekday: "Wed", time_from: "19:00", time_to: "20:30" },
    ]);
  });

  it("collapses uniform slots", () => {
    const slots = [
      { weekday: "Mon", time_from: "19:00", time_to: "20:30" },
      { weekday: "Wed", time_from: "19:00", time_to: "20:30" },
    ];
    expect(slotsToSimpleValue(slots)).toEqual({
      weekdays: ["Mon", "Wed"],
      time_from: "19:00",
      time_to: "20:30",
      course_type: null,
    });
    expect(canCollapseSlotsToSimple(slots, false)).toBe(true);
  });

  it("rejects mixed times and Friday in WD/WE mode", () => {
    expect(
      canCollapseSlotsToSimple(
        [{ weekday: "Fri", time_from: "19:00", time_to: "20:30" }],
        true,
      ),
    ).toBe(false);
    expect(
      canCollapseSlotsToSimple(
        [
          { weekday: "Mon", time_from: "19:00", time_to: "20:30" },
          { weekday: "Wed", time_from: "18:00", time_to: "19:00" },
        ],
        false,
      ),
    ).toBe(false);
  });
});

describe("orgUsesWdWeNomenclature", () => {
  it("is true when course_type is listed", () => {
    expect(orgUsesWdWeNomenclature(["title", "course_type"])).toBe(true);
    expect(orgUsesWdWeNomenclature(["title"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/simple-schedule.test.ts
```

- [ ] **Step 3: Implement `simple-schedule.ts`**

Implement all exports with the semantics above. `normalizeTimeToHhMm` should accept `19:00:00` → `19:00`. `addMinutesToHhMm` must handle hour wrap within the same day for typical class lengths (no overnight required for v1; if end ≤ start after add, still return computed clock time and let validators catch overnight if needed — prefer same-day duration only).

- [ ] **Step 4: Update `createEmptyRecurringSlot`**

Change signature to accept optional org defaults:

```typescript
import { createDefaultSimpleValue, simpleValueToSlots } from "@/helpers/simple-schedule";

export function createEmptyRecurringSlot(
  org?: { default_session_start_time?: string | null; default_session_duration_minutes?: number | null } | null,
): RecurringSlot {
  const simple = createDefaultSimpleValue(org);
  // Prefer a single placeholder slot for Custom "add slot" — Mon + default range:
  return {
    weekday: "Mon",
    time_from: simple.time_from,
    time_to: simple.time_to,
  };
}
```

Update `recurring-slots-editor.tsx` `addSlot` if it needs tenant: `createEmptyRecurringSlot({ default_session_start_time: tenant?.default_session_start_time, default_session_duration_minutes: tenant?.default_session_duration_minutes })`.

Update `intake-schedule.test.ts` only if assertions depend on 09:00–10:00 for `createEmptyRecurringSlot` (add a focused test or adjust).

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/simple-schedule.test.ts src/helpers/intake-schedule.test.ts
```

- [ ] **Step 6: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/simple-schedule.ts src/helpers/simple-schedule.test.ts src/helpers/intake-schedule.ts src/helpers/intake-schedule.test.ts src/components/scheduling/intake/recurring-slots-editor.tsx
git commit -m "$(cat <<'EOF'
feat(scheduling): add simple-schedule expand/collapse helpers

EOF
)"
```

---

### Task 4: `SimpleSchedulePicker` component

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.tsx`
- Create: `schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.test.tsx`

**Interfaces:**
- Consumes: helpers from Task 3; UI primitives (`Button`, `Field`, existing `TimeSelect` or `Input type="time"` matching intake editor)
- Produces:

```tsx
export type SimpleSchedulePickerProps = {
  value: SimpleScheduleValue;
  onChange: (next: SimpleScheduleValue) => void;
  useWdWeNomenclature: boolean;
  mode: "simple" | "custom";
  onModeChange: (mode: "simple" | "custom") => void;
  renderCustom: () => React.ReactNode;
  /** When true, show Back to simple if canCollapse… */
  customSlotsForCollapse?: RecurringSlot[];
  idPrefix?: string;
  sessionsLabel?: string;
};
```

Behavior:
- **Simple + standard:** toggle chips for each `weekdayNames` entry; multi-select; `course_type` forced `null`.
- **Simple + WD/WE:** two buttons WD / WE (exclusive). Selecting WD sets `weekdays` to WD set + `course_type: "WD"`. Same for WE. Clicking selected again clears selection (`weekdays: []`, `course_type: null`).
- **Time:** two inputs; changing start recomputes end using current duration (`time_to - time_from` minutes, or org default if invalid).
- **Custom schedule →** calls `onModeChange("custom")`.
- **Custom mode:** render `renderCustom()`; if `customSlotsForCollapse` provided and `canCollapseSlotsToSimple(slots, useWdWe)`, show **Back to simple** that calls `onModeChange("simple")` and `onChange(slotsToSimpleValue(slots)!)`.

- [ ] **Step 1: Write component tests**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimpleSchedulePicker } from "./simple-schedule-picker";
import type { SimpleScheduleValue } from "@/helpers/simple-schedule";

const base: SimpleScheduleValue = {
  weekdays: [],
  time_from: "19:00",
  time_to: "20:30",
  course_type: null,
};

describe("SimpleSchedulePicker", () => {
  it("shows weekday chips by default", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="simple"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM</div>}
      />,
    );
    expect(screen.getByRole("button", { name: "Mon" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "WD" })).toBeNull();
  });

  it("shows WD/WE when nomenclature enabled", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature
        mode="simple"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM</div>}
      />,
    );
    expect(screen.getByRole("button", { name: "WD" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "WE" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mon" })).toBeNull();
  });

  it("switches to custom", () => {
    const onModeChange = vi.fn();
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="simple"
        onModeChange={onModeChange}
        renderCustom={() => <div>CUSTOM</div>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /custom schedule/i }));
    expect(onModeChange).toHaveBeenCalledWith("custom");
  });

  it("renders custom slot", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="custom"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM_EDITOR</div>}
      />,
    );
    expect(screen.getByText("CUSTOM_EDITOR")).toBeTruthy();
  });
});
```

Match the repo’s Testing Library setup (happy-dom / vitest). If `toBeInTheDocument` matchers exist, use those; otherwise truthy checks as above.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/scheduling/simple-schedule-picker.test.tsx
```

- [ ] **Step 3: Implement the component**

Use existing design primitives (`Button`, `Field`, toggle selected styles consistent with other chip UIs). Keep layout compact — no card chrome beyond what intake already uses.

- [ ] **Step 4: Run — expect PASS**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/components/scheduling/simple-schedule-picker.test.tsx
```

- [ ] **Step 5: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/components/scheduling/simple-schedule-picker.tsx src/components/scheduling/simple-schedule-picker.test.tsx
git commit -m "$(cat <<'EOF'
feat(scheduling): add SimpleSchedulePicker with custom escape hatch

EOF
)"
```

---

### Task 5: Wire intake preview (default + per-row)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/intake/course-preview-step.tsx`
- Modify: `schedjuice-reimagined-fe/src/helpers/intake-generation-defaults.ts` (ensure `course_type` from simple WD/WE flows into payload)
- Optionally keep `recurring-slots-editor.tsx` as Custom renderer only

**Interfaces:**
- Consumes: `SimpleSchedulePicker`, helpers, `useTenant()`
- Produces: `defaultSlots` / row overrides still as `RecurringSlot[]` in create-flow context; when simple WD/WE selected, generation defaults include `course_type`

- [ ] **Step 1: Replace default sessions editor**

Around the existing `<RecurringSlotsEditor …>` for defaults (~L806):

1. Read `tenant` via `useTenant()`.
2. `useWdWe = orgUsesWdWeNomenclature(tenant?.course_fields)`.
3. Local state: `scheduleMode: "simple" | "custom"` initialized with `canCollapseSlotsToSimple(defaultSlots, useWdWe) || defaultSlots.length === 0 ? "simple" : "custom"`.
4. When `scheduleMode === "simple"`, derive `SimpleScheduleValue` from slots or `createDefaultSimpleValue(tenant)`.
5. On simple `onChange`, write `simpleValueToSlots(value)` into `setDefaultSlots`.
6. `renderCustom={() => <RecurringSlotsEditor slots={…} onChange={…} />}`.
7. Persist `course_type` into intake generation defaults state when `value.course_type` is set (follow how `course_type` is already stored in preview step / context — grep `course_type` in `course-preview-step.tsx` and `create-flow-context.tsx`).

- [ ] **Step 2: Same pattern for per-row override editor** (~L1066)

When a row uses override slots, wrap with the same picker. Initial mode per row from `canCollapseSlotsToSimple`.

- [ ] **Step 3: Ensure generate payload includes course_type**

In `intake-generation-defaults.ts`, keep existing `course_type` passthrough; verify preview step sets defaults when WD/WE picked.

- [ ] **Step 4: Manual smoke**

Run unit tests for helpers + picker. Manually: open intake preview, confirm 19:00–20:30, pick Mon/Wed, generate still works. With `course_type` in course_fields, confirm WD/WE buttons.

- [ ] **Step 5: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/components/scheduling/intake/course-preview-step.tsx src/helpers/intake-generation-defaults.ts
git commit -m "$(cat <<'EOF'
feat(intake): use simple-first schedule picker on course preview

EOF
)"
```

---

### Task 6: Wire calendar event form (create recurring)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/event-form.tsx`
- Modify course save path if needed to PATCH `course_type` when WD/WE selected (use existing course update mutation/API already used elsewhere in course edit)

**Interfaces:**
- Consumes: `SimpleSchedulePicker`, `resolveSessionDefaults`, `useTenant`, existing `repeat_every` / time fields
- Produces: unchanged event create payload shape; optional course `course_type` update on submit when nomenclature mode and type selected

- [ ] **Step 1: Default times on create**

When `!isEdit` and mounting new event, initialize `time_from` / `time_to` from `resolveSessionDefaults(tenant)` instead of empty/prior values (preserve selectedEvent times when editing).

- [ ] **Step 2: Simple day UI when `is_recurring`**

When `!isEdit && isRecurring`:
- Replace the weekday checkbox block with `SimpleSchedulePicker` in simple mode bound to `repeat_every` + times.
- Map: `value.weekdays` ↔ `repeat_every`; times ↔ form `time_from`/`time_to`.
- Custom mode: show the **existing** checkbox UI for `repeat_every` (and keep date range / Sabbath controls as today).
- Do **not** change edit-existing-event path (still single date).

- [ ] **Step 3: course_type on save**

If `useWdWe` and `course_type` is WD/WE and `course?.id` exists, after successful event save (or in the same submit handler before/after), PATCH course with `{ course_type }` using the same client helper other course edit forms use (`axios` / react-query mutation — grep `course_type` updates in FE). If no existing helper, add a small `updateCourseFields(courseId, { course_type })` call next to the edit-events save. Failures should surface a toast; do not roll back events if type update fails — log + toast (YAGNI for transactional coupling).

- [ ] **Step 4: Unit / smoke**

Add a focused test only if extractable pure mapping is non-trivial; otherwise manual smoke on `/courses/{id}/edit?tab=edit-schedule`: create recurring → simple defaults → Custom shows checkboxes.

- [ ] **Step 5: Commit (FE)**

```bash
cd schedjuice-reimagined-fe
git add src/components/calendar/event-form.tsx
# plus any small helper added for course_type patch
git commit -m "$(cat <<'EOF'
feat(calendar): simple-first recurring day picker on event create

EOF
)"
```

---

### Task 7: Audit remaining create paths + finalize defaults

**Files:**
- Grep FE for other day/time schedule entry points under `src/components/scheduling` and course create
- Modify: `manual-course-form.tsx` only if it sets session days/times (today it mostly sets date span — if so, no change; ensure redirect lands on schedule tab that uses Task 6)

**Interfaces:**
- Consumes: Tasks 4–6
- Produces: confirmation that all “set days/times when creating a course” paths use simple-first UI

- [ ] **Step 1: Grep audit**

```bash
cd schedjuice-reimagined-fe
rg -n "RecurringSlotsEditor|repeat_every|createEmptyRecurringSlot|Set recurring" src --glob '*.{ts,tsx}'
```

For each hit outside teacher-assign Recurring Mode and read-only displays, either wire picker or document as N/A in the commit message.

- [ ] **Step 2: Fix any missed create path**

Apply the same picker wrapper pattern as Task 5/6.

- [ ] **Step 3: Run FE unit suite for scheduling helpers**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/simple-schedule.test.ts src/helpers/intake-schedule.test.ts src/components/scheduling/simple-schedule-picker.test.tsx src/types/course-fields-simple-schedule.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit if any changes**

```bash
cd schedjuice-reimagined-fe
git add -A
git commit -m "$(cat <<'EOF'
chore(scheduling): finish simple-schedule create-path audit

EOF
)"
```

Skip empty commit if nothing to add.

---

### Task 8: Spec status + cross-repo plan copies

**Files:**
- Modify: design specs status line to `Approved`
- Ensure plan exists under FE/BE `docs/superpowers/plans/` (copy this file)

- [ ] **Step 1: Update design status**

In both FE/BE (and root) copies of `2026-07-18-simple-course-scheduling-design.md`:

`**Status:** Approved`

- [ ] **Step 2: Copy plan into repos**

```bash
cp docs/superpowers/plans/2026-07-18-simple-course-scheduling.md \
  schedjuice-reimagined-fe/docs/superpowers/plans/
cp docs/superpowers/plans/2026-07-18-simple-course-scheduling.md \
  schedjuice-reimagined-be/docs/superpowers/plans/
```

- [ ] **Step 3: Commit docs in each repo**

```bash
cd schedjuice-reimagined-fe
git add docs/superpowers/plans/2026-07-18-simple-course-scheduling.md docs/superpowers/specs/2026-07-18-simple-course-scheduling-design.md
git commit -m "$(cat <<'EOF'
docs: add simple-course-scheduling implementation plan

EOF
)"

cd ../schedjuice-reimagined-be
git add docs/superpowers/plans/2026-07-18-simple-course-scheduling.md docs/superpowers/specs/2026-07-18-simple-course-scheduling-design.md
git commit -m "$(cat <<'EOF'
docs: add simple-course-scheduling implementation plan

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Simple default all tenants | 4–6 |
| Custom → today’s full UI | 4, 5 (`RecurringSlotsEditor`), 6 (checkbox UI) |
| Org start/duration defaults | 1, 2, 3 |
| Surfaces: intake + calendar + other create | 5, 6, 7 |
| WD/WE via `course_type` in `course_fields` | 2, 3, 4 |
| WD Mon–Thu, WE Sat–Sun, Friday custom-only | 3, 4 |
| WD/WE sets `course_type` | 5 (intake defaults), 6 (course PATCH) |
| No new persistence model | All tasks map to slots/events |
| Teacher Recurring Mode untouched | Non-goal; Task 7 audit skips it |
| Testing | 1, 3, 4, 7 |

No intentional placeholders left in task steps.
