# Org Time Format, Styled Time Picker & Date Contrast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add org `time_display_format` (default `12h`), shared format helpers for pickers and labels, a branded custom `TimePicker` for schedule From/To, and fix date calendar selected/outside-day contrast.

**Architecture:** Store preference on `Organization`; expose via public tenant. Pure FE formatters take an explicit format (default `12h`). New popover `TimePicker` reads tenant format and always emits `HH:mm`. Existing TimeSelect / InlineTimeSelect / DateTimePickers and display call sites pass the same format. Calendar day buttons use action CSS vars so selected text stays light on green.

**Tech Stack:** Django `TextChoices` + migration; Next.js client components; Base UI `Popover`; Vitest; BE `./scripts/run_backend_tests.sh` with `--keepdb`.

**Spec:** `docs/superpowers/specs/2026-07-21-org-time-format-and-pickers-design.md`

## Global Constraints

- API/DB times stay 24h `HH:mm` / `HH:mm:ss`; preference is display/input only.
- Default and fallback format is **`12h`**.
- Values: `"12h"` | `"24h"` only.
- Schedule `type="time"` must be replaced (native popover cannot be styled).
- Backend tests: always `--keepdb` via `./scripts/run_backend_tests.sh`.
- Prefer high-value tests (auth/edge/format round-trips); no happy-path-only smoke.
- Out of scope: user-level override, emails/PDFs/mobile, media duration clocks, chrome/courses file dedupe beyond applying the same calendar class fixes.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `schedjuice-reimagined-be/app_organization/models.py` | Modify | `TimeDisplayFormat` + `time_display_format` field |
| `schedjuice-reimagined-be/app_organization/migrations/0079_organization_time_display_format.py` | Create | Migration (use next number if 0079 taken) |
| `schedjuice-reimagined-be/app_organization/tests/test_time_display_format.py` | Create | Default + serializer choice validation |
| `schedjuice-reimagined-fe/src/types/organization.ts` | Modify | Enum + Zod field |
| `schedjuice-reimagined-fe/src/config/organization-profile-sections.ts` | Modify | Add to `region-currency` keys |
| `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx` | Modify | Field description (optional) |
| `schedjuice-reimagined-fe/src/helpers/time-format.ts` | Create | `resolveTimeDisplayFormat`, `formatOrgTime`, `formatOrgTimeRange` |
| `schedjuice-reimagined-fe/src/helpers/time-format.test.ts` | Create | Unit tests for format edges |
| `schedjuice-reimagined-fe/src/helpers/date.ts` | Modify | Optional format on `formateEventTime` / `formatSessionClock` |
| `schedjuice-reimagined-fe/src/components/date/calendar.tsx` | Modify | Selected + outside contrast |
| `schedjuice-reimagined-fe/src/app/_chrome/calendar.tsx` | Modify | Same contrast if independent |
| `schedjuice-reimagined-fe/src/components/courses/ui/calendar.tsx` | Modify | Same contrast if independent |
| `schedjuice-reimagined-fe/src/components/date/time-picker.tsx` | Create | Custom popover TimePicker |
| `schedjuice-reimagined-fe/src/components/date/time-picker.test.tsx` | Create | 12h/24h emit `HH:mm` |
| `schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.tsx` | Modify | Use TimePicker |
| `schedjuice-reimagined-fe/src/components/scheduling/intake/recurring-slots-editor.tsx` | Modify | Use TimePicker |
| `schedjuice-reimagined-fe/src/components/calendar/time-select.tsx` | Modify | Respect 24h (no AM/PM) |
| `schedjuice-reimagined-fe/src/components/datatable/inline-time-select.tsx` | Modify | Respect format |
| `schedjuice-reimagined-fe/src/components/date/date-time-picker.tsx` (+ chrome/courses copies) | Modify | Respect format on trigger / columns |
| Display call sites (see Task 7) | Modify | Pass `timeFormat` from `useTenant()` |

---

### Task 1: Backend `time_display_format`

**Files:**
- Modify: `schedjuice-reimagined-be/app_organization/models.py` (near `timezone`)
- Create: `schedjuice-reimagined-be/app_organization/migrations/0079_organization_time_display_format.py`
- Create: `schedjuice-reimagined-be/app_organization/tests/test_time_display_format.py`

**Interfaces:**
- Consumes: `Organization` model, `OrganizationSerializer`
- Produces: `Organization.time_display_format: str` default `"12h"`; choices `"12h"` | `"24h"`; included on serializers automatically

- [ ] **Step 1: Write failing tests**

Create `app_organization/tests/test_time_display_format.py`. Copy org-create patterns from an existing org test (required fields). Minimal shape:

```python
from django.test import TestCase

from app_organization.models import Organization
from app_organization.serializers import OrganizationSerializer


class TimeDisplayFormatTests(TestCase):
    def test_model_default_is_12h(self):
        org = Organization(name="T", schema_name="t_time_fmt")
        self.assertEqual(org.time_display_format, Organization.TimeDisplayFormat.TWELVE_H)

    def test_serializer_rejects_invalid_choice(self):
        org = Organization.objects.create(name="T2", schema_name="t_time_fmt2")
        ser = OrganizationSerializer(
            org,
            data={"time_display_format": "36h"},
            partial=True,
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("time_display_format", ser.errors)

    def test_serializer_accepts_24h(self):
        org = Organization.objects.create(name="T3", schema_name="t_time_fmt3")
        ser = OrganizationSerializer(
            org,
            data={"time_display_format": "24h"},
            partial=True,
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        ser.save()
        org.refresh_from_db()
        self.assertEqual(org.time_display_format, "24h")
```

Adjust `objects.create` kwargs to match existing org test helpers if create fails.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_time_display_format -v 2
```

Expected: FAIL — field missing.

- [ ] **Step 3: Add model field**

In `models.py` on `Organization` (near `timezone`):

```python
class TimeDisplayFormat(models.TextChoices):
    TWELVE_H = "12h", "12-hour"
    TWENTY_FOUR_H = "24h", "24-hour"

time_display_format = models.CharField(
    max_length=3,
    choices=TimeDisplayFormat.choices,
    default=TimeDisplayFormat.TWELVE_H,
    help_text="How times are shown in the app UI (pickers and labels).",
)
```

- [ ] **Step 4: Migration**

```bash
cd schedjuice-reimagined-be && ./env/bin/python manage.py makemigrations app_organization --name organization_time_display_format
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_time_display_format -v 2
```

- [ ] **Step 6: Commit**

```bash
git add schedjuice-reimagined-be/app_organization/models.py \
  schedjuice-reimagined-be/app_organization/migrations/*time_display_format*.py \
  schedjuice-reimagined-be/app_organization/tests/test_time_display_format.py
git commit -m "$(cat <<'EOF'
feat(org): add time_display_format setting (default 12h)

EOF
)"
```

---

### Task 2: FE org type + Region settings UI

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization.ts`
- Modify: `schedjuice-reimagined-fe/src/config/organization-profile-sections.ts`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx` (field description)

**Interfaces:**
- Consumes: Task 1 API field
- Produces: `TimeDisplayFormat` enum; `organizationFieldsSchema.time_display_format`; section key so AutoForm shows select

- [ ] **Step 1: Add enum + Zod field**

Near other enums in `organization.ts`:

```typescript
export enum TimeDisplayFormat {
  "12h" = "12h",
  "24h" = "24h",
}
```

In `organizationFieldsSchema` after `timezone`:

```typescript
time_display_format: z
  .nativeEnum(TimeDisplayFormat)
  .default(TimeDisplayFormat["12h"])
  .describe("Time display format"),
```

Export enum from the file’s existing export list if applicable.

- [ ] **Step 2: Section key**

In `organization-profile-sections.ts` `region-currency.keys`:

```typescript
keys: [
  "timezone",
  "time_display_format",
  "currency_fullname",
  "currency_symbol",
  "currency_iso4217",
],
```

Update section description to mention time format, e.g. “Timezone, clock format, and how money amounts are labeled.”

- [ ] **Step 3: Field config**

In `use-org-record-form.tsx` field config map (same pattern as `timezone`):

```typescript
time_display_format: {
  description: "How times appear in calendars, schedules, and labels.",
},
```

- [ ] **Step 4: Smoke typecheck / unit if any org schema test exists**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/types/organization.ts 2>/dev/null || true
```

Prefer: open org profile Region section in manual QA later. Ensure `organizationOwnerEditSchema` includes the new field (it should via `organizationFieldsSchema` unless omitted).

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-fe/src/types/organization.ts \
  schedjuice-reimagined-fe/src/config/organization-profile-sections.ts \
  schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx
git commit -m "$(cat <<'EOF'
feat(org): expose time_display_format in Region settings

EOF
)"
```

---

### Task 3: Shared time format helpers

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/time-format.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/time-format.test.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/date.ts`
- Reuse: `schedjuice-reimagined-fe/src/helpers/time-12h.ts`

**Interfaces:**
- Consumes: `hhmmTo12HourSegments`, `segmentsToHhmm` from `time-12h.ts`
- Produces:
  - `export type TimeDisplayFormatValue = "12h" | "24h"`
  - `resolveTimeDisplayFormat(raw: unknown): TimeDisplayFormatValue`
  - `formatOrgTime(raw: string | null | undefined, format?: TimeDisplayFormatValue): string`
  - `formatOrgTimeRange(from, to, format?): string`
  - `formateEventTime(timeString, format?)` / `formatSessionClock(raw, format?)` honor format

- [ ] **Step 1: Failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  formatOrgTime,
  formatOrgTimeRange,
  resolveTimeDisplayFormat,
} from "./time-format";

describe("resolveTimeDisplayFormat", () => {
  it("defaults unknown to 12h", () => {
    expect(resolveTimeDisplayFormat(undefined)).toBe("12h");
    expect(resolveTimeDisplayFormat("nope")).toBe("12h");
  });
  it("accepts 24h", () => {
    expect(resolveTimeDisplayFormat("24h")).toBe("24h");
  });
});

describe("formatOrgTime", () => {
  it("formats midnight and noon in 12h", () => {
    expect(formatOrgTime("00:00", "12h")).toBe("12:00 AM");
    expect(formatOrgTime("12:00", "12h")).toBe("12:00 PM");
  });
  it("formats afternoon in 12h and 24h", () => {
    expect(formatOrgTime("19:30", "12h")).toBe("7:30 PM");
    expect(formatOrgTime("19:30", "24h")).toBe("19:30");
  });
  it("accepts HH:mm:ss", () => {
    expect(formatOrgTime("09:05:00", "24h")).toBe("09:05");
  });
});

describe("formatOrgTimeRange", () => {
  it("joins with en dash", () => {
    expect(formatOrgTimeRange("19:00", "20:30", "12h")).toBe("7:00 PM – 8:30 PM");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/time-format.test.ts
```

- [ ] **Step 3: Implement `time-format.ts`**

```typescript
import { hhmmTo12HourSegments } from "@/helpers/time-12h";

export type TimeDisplayFormatValue = "12h" | "24h";

export function resolveTimeDisplayFormat(raw: unknown): TimeDisplayFormatValue {
  return raw === "24h" || raw === "12h" ? raw : "12h";
}

function normalizeToHhMm(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  // ISO datetime → take time portion if present
  const candidate = t.includes("T") ? t.split("T")[1]?.slice(0, 8) ?? t : t;
  const parts = candidate.split(":");
  if (parts.length < 2) return null;
  const h = parts[0].padStart(2, "0");
  const m = parts[1].padStart(2, "0");
  return `${h}:${m}`;
}

export function formatOrgTime(
  raw: string | null | undefined,
  format: TimeDisplayFormatValue = "12h",
): string {
  if (raw == null || !String(raw).trim()) return "—";
  const hhmm = normalizeToHhMm(String(raw));
  if (!hhmm) return "—";
  if (format === "24h") return hhmm;
  const { hour, minute, period } = hhmmTo12HourSegments(hhmm);
  if (!hour || !minute || !period) return "—";
  return `${hour}:${minute} ${period}`;
}

export function formatOrgTimeRange(
  from: string | null | undefined,
  to: string | null | undefined,
  format: TimeDisplayFormatValue = "12h",
): string {
  return `${formatOrgTime(from, format)} – ${formatOrgTime(to, format)}`;
}
```

Tune exact 12h string (`7:30 PM` vs `07:30 PM`) to match tests; prefer unpadded hour for 12h (common US style) unless product already pads — then align tests to existing `formateEventTime` (`hh:mm a` from date-fns pads hour with leading space/zero — check current output and match for minimal churn).

If existing `formateEventTime("19:00:00")` yields `07:00 PM` (date-fns `hh`), keep that padding in `formatOrgTime` for 12h to avoid widespread label churn:

```typescript
return `${hour.padStart(2, "0")}:${minute} ${period}`;
```

Update tests accordingly.

- [ ] **Step 4: Plumb `date.ts`**

```typescript
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";

export const formateEventTime = (
  timeString: string,
  format: TimeDisplayFormatValue = "12h",
) => formatOrgTime(timeString, resolveTimeDisplayFormat(format));

export function formatSessionClock(
  raw: string,
  format: TimeDisplayFormatValue = "12h",
) {
  const t = raw.trim();
  if (!t) return "—";
  return formatOrgTime(t, resolveTimeDisplayFormat(format));
}
```

Keep previous try/catch behavior only if needed; prefer thin wrappers.

Update any existing unit tests that assert exact `formateEventTime` / `formatSessionClock` strings if they break.

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/time-format.test.ts src/helpers/time-12h.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add schedjuice-reimagined-fe/src/helpers/time-format.ts \
  schedjuice-reimagined-fe/src/helpers/time-format.test.ts \
  schedjuice-reimagined-fe/src/helpers/date.ts
git commit -m "$(cat <<'EOF'
feat(fe): add org-aware time display format helpers

EOF
)"
```

---

### Task 4: Date calendar contrast

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/date/calendar.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/_chrome/calendar.tsx` (if it has its own `day_selected` / `day_outside`)
- Modify: `schedjuice-reimagined-fe/src/components/courses/ui/calendar.tsx` (same)

**Interfaces:**
- Consumes: `buttonVariants` ghost day base
- Produces: selected day readable on action green; outside days muted without double fade

- [ ] **Step 1: Patch `day_selected` and outside styles in `components/date/calendar.tsx`**

Replace:

```typescript
day_selected:
  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
day_outside: "text-muted-foreground opacity-50",
day_disabled: "text-muted-foreground opacity-50",
```

With:

```typescript
day_selected:
  "bg-[var(--action,var(--data-green-strong,#2f6e58))] text-[var(--action-foreground,#ffffff)] hover:bg-[color-mix(in_srgb,var(--action,var(--data-green-strong,#2f6e58))_88%,#000)] hover:text-[var(--action-foreground,#ffffff)] focus:bg-[var(--action,var(--data-green-strong,#2f6e58))] focus:text-[var(--action-foreground,#ffffff)]",
day_outside: "text-text-muted",
day_disabled: "text-text-muted",
```

Also set `head_cell` to `text-text-muted` if still on `text-muted-foreground` for consistency.

- [ ] **Step 2: Mirror into chrome + courses calendars**

Apply the same `day_selected` / `day_outside` / `day_disabled` class strings wherever those files define them (courses copy currently uses `bg-accent` — still ensure selected text is light on dark green: if accent is already `--data-green-strong` + white foreground, keep accent but remove outside `opacity-50`).

- [ ] **Step 3: Manual check**

Open a DatePicker, select a day — number must be light on green; outside-month numbers readable.

- [ ] **Step 4: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/date/calendar.tsx \
  schedjuice-reimagined-fe/src/app/_chrome/calendar.tsx \
  schedjuice-reimagined-fe/src/components/courses/ui/calendar.tsx
git commit -m "$(cat <<'EOF'
fix(ui): improve date picker selected and outside-day contrast

EOF
)"
```

---

### Task 5: Custom `TimePicker` + schedule wiring

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/date/time-picker.tsx`
- Create: `schedjuice-reimagined-fe/src/components/date/time-picker.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/intake/recurring-slots-editor.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.test.tsx` (if selectors break)

**Interfaces:**
- Consumes: `Popover`, `inputClassName`, `useTenant`, `time-12h` / `time-format`, `normalizeTimeToHhMm`
- Produces: `<TimePicker value onChange />` emitting `HH:mm`

- [ ] **Step 1: Failing component test (behavior)**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimePicker } from "./time-picker";

describe("TimePicker", () => {
  it("emits HH:mm when picking PM hour in 12h mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TimePicker
        value="19:00"
        onChange={onChange}
        timeDisplayFormat="12h"
      />,
    );
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("option", { name: "8" })); // hour
    // Implementation detail: use whatever roles the list uses (option/listbox).
    // Assert last onChange is HH:mm 24h.
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(last).toMatch(/^\d{2}:\d{2}$/);
  });
});
```

Adjust roles to match implementation (`button` items with `aria-selected` are fine). Prefer asserting: change minute in 24h mode from `19:00` → click `30` → `19:30`.

- [ ] **Step 2: Implement `TimePicker`**

Skeleton:

```tsx
"use client";

import { useTenant } from "@/hooks/useTenant";
import { inputClassName } from "@/components/primitives/input";
import { Popover } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { Clock } from "iconoir-react";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import {
  hhmmTo12HourSegments,
  segmentsToHhmm,
  type Time12Period,
} from "@/helpers/time-12h";
import { normalizeTimeToHhMm } from "@/helpers/simple-schedule"; // or local pad helper

export type TimePickerProps = {
  id?: string;
  value: string;
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  className?: string;
  minuteStep?: number;
  timeDisplayFormat?: TimeDisplayFormatValue;
};

export function TimePicker({
  id,
  value,
  onChange,
  disabled,
  className,
  minuteStep = 1,
  timeDisplayFormat,
}: TimePickerProps) {
  const { tenant } = useTenant();
  const format = resolveTimeDisplayFormat(
    timeDisplayFormat ?? tenant?.time_display_format,
  );
  const hhmm = normalizeTimeToHhMm(value) || "00:00";
  // build columns; on select call onChange(segmentsToHhmm(...)) or pad 24h
  // Trigger shows formatOrgTime(hhmm, format)
  // Selected cell classes use --action / --action-foreground
  return (/* Popover.Root … */);
}
```

Use `Popover.Trigger` as the styled field; `Popover.Popup` with `p-2` and two/three `overflow-y-auto max-h-48` columns. Mark selected with action background + `aria-selected`.

Mock `useTenant` in tests if needed (`vi.mock("@/hooks/useTenant", ...)`).

- [ ] **Step 3: Wire schedule pickers**

Replace each `Input type="time"` with:

```tsx
<TimePicker
  id={`${idPrefix}-from`}
  className="w-[150px]"
  value={value.time_from}
  onChange={(next) => updateStart(next)}
/>
```

Same for To / recurring slots. Keep `Field.Label htmlFor` pointing at trigger `id`.

- [ ] **Step 4: Fix schedule picker tests**

Update `simple-schedule-picker.test.tsx` if it queried `input[type=time]` — use role/button or label instead.

- [ ] **Step 5: Run tests**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- \
  src/components/date/time-picker.test.tsx \
  src/components/scheduling/simple-schedule-picker.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/date/time-picker.tsx \
  schedjuice-reimagined-fe/src/components/date/time-picker.test.tsx \
  schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.tsx \
  schedjuice-reimagined-fe/src/components/scheduling/intake/recurring-slots-editor.tsx \
  schedjuice-reimagined-fe/src/components/scheduling/simple-schedule-picker.test.tsx
git commit -m "$(cat <<'EOF'
feat(scheduling): replace native time inputs with branded TimePicker

EOF
)"
```

---

### Task 6: Existing pickers respect org format

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/time-select.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/datatable/inline-time-select.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/date/date-time-picker.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/_chrome/date-time-picker.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/courses/ui/date-time-picker.tsx`

**Interfaces:**
- Consumes: `useTenant`, `resolveTimeDisplayFormat`, `time-12h` helpers
- Produces: 24h mode without AM/PM; trigger labels via `formatOrgTime` where applicable

- [ ] **Step 1: `TimeSelect`**

When format is `24h`:

- Hours: `00`–`23` (or `0`–`23` padded).
- Minutes: unchanged (`isPrecise` behavior).
- Omit period `Select`.
- `onChange` builds `HH:mm` directly (no `segmentsToTimeValueHhmm`).

When `12h`: keep current behavior.

Optional prop `timeDisplayFormat?: TimeDisplayFormatValue` for tests; default from tenant.

- [ ] **Step 2: `InlineTimeSelect`**

Same branching; display closed value with `formatOrgTime(hhmm, format)` instead of always `formatSessionClock` 12h.

- [ ] **Step 3: DateTimePicker copies**

- 24h: hide AM/PM select; hour 0–23.
- Trigger text: `format(date, format === "24h" ? "MM/dd/yyyy HH:mm" : "MM/dd/yyyy hh:mm aa")`.
- Placeholder strings follow format.

- [ ] **Step 4: Targeted unit test or light interaction test for TimeSelect 24h**

Assert that with `timeDisplayFormat="24h"` the AM/PM placeholder/control is absent (query by text `/AM\/PM/i` → null).

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/calendar/time-select.tsx \
  schedjuice-reimagined-fe/src/components/datatable/inline-time-select.tsx \
  schedjuice-reimagined-fe/src/components/date/date-time-picker.tsx \
  schedjuice-reimagined-fe/src/app/_chrome/date-time-picker.tsx \
  schedjuice-reimagined-fe/src/components/courses/ui/date-time-picker.tsx
git commit -m "$(cat <<'EOF'
feat(fe): honor org time_display_format in existing time pickers

EOF
)"
```

---

### Task 7: Plumb format into display call sites

**Files (representative — grep and update all session-clock callers):**
- Any component calling `formatSessionClock(...)` or `formateEventTime(...)` without format → pass tenant format
- Local formatters (e.g. attendance `formatTimeHm`) → use `formatOrgTime`
- `helpers/course-insights.ts` `formatOverlapSessionTime` → accept format or use `formatOrgTime`
- `helpers/attendance-marking.ts`, `helpers/record-academic/calendar-sessions.ts`, calendar slot/list/week views, shortcuts, course header, payroll/checkin pages using `formatTime` for clocks

**Interfaces:**
- Consumes: `useTenant`, `resolveTimeDisplayFormat`, `formatOrgTime` / updated session helpers
- Produces: UI labels flip when org setting changes after `refetchTenant()`

- [ ] **Step 1: Inventory**

```bash
cd schedjuice-reimagined-fe && rg -n "formatSessionClock\(|formateEventTime\(|formatOverlapSessionTime\(|formatTimeHm\(" src --glob '*.{ts,tsx}'
```

Skip `media/native-recording-player.tsx` duration helper.

- [ ] **Step 2: Update pure helpers that format session times**

Example `formatOverlapSessionTime`:

```typescript
export function formatOverlapSessionTime(
  value: string,
  format: TimeDisplayFormatValue = "12h",
): string {
  return formatOrgTime(value, format);
}
```

Update its React caller to pass tenant format.

- [ ] **Step 3: Update React call sites**

Pattern:

```tsx
const { tenant } = useTenant();
const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
// ...
formatSessionClock(event.time_from, timeFormat)
```

For server components without tenant hook, pass format from a parent client boundary or keep default `12h` until that tree has tenant (document any intentional default).

- [ ] **Step 4: Replace ad-hoc AM/PM in attendance pages**

`courses/[id]/attendance/page.tsx` and `meeting-attendance/page.tsx` local `formatTimeHm` → `formatOrgTime`.

- [ ] **Step 5: Smoke unit tests for helpers that changed signatures**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/time-format.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -u schedjuice-reimagined-fe/src
git commit -m "$(cat <<'EOF'
feat(fe): apply org time format to session and event labels

EOF
)"
```

---

### Task 8: End-to-end verification

**Files:** none (QA)

- [ ] **Step 1: BE regression**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_time_display_format -v 2
```

- [ ] **Step 2: FE unit cluster**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- \
  src/helpers/time-format.test.ts \
  src/helpers/time-12h.test.ts \
  src/components/date/time-picker.test.tsx \
  src/components/scheduling/simple-schedule-picker.test.tsx
```

- [ ] **Step 3: Manual checklist**

1. Org → Region and currency → set **24-hour** → save → hard refresh.
2. Course create / intake schedule: From/To popover is branded (no OS blue); shows 24h columns.
3. Same flow with **12-hour**: AM/PM column; trigger like `7:00 PM`.
4. Open date picker: selected day light text on green; outside days readable.
5. Spot-check: today’s classes widget / course header session range / calendar event chip match the setting.

- [ ] **Step 4: Final commit only if verification fixes were needed**

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Org `time_display_format` default `12h` | Task 1–2 |
| Shared format helpers | Task 3 |
| Pickers + displays (option 3) | Tasks 5–7 |
| Custom TimePicker for schedule | Task 5 |
| TimeSelect / Inline / DateTimePicker | Task 6 |
| Date selected + outside contrast | Task 4 |
| Storage stays 24h | Global + Tasks 5–6 |
| Non-goals (media duration, emails) | Global Constraints |

## Placeholder / consistency check

- Migration number: use next after latest `0078`; rename in plan if `makemigrations` differs.
- 12h padding: lock to existing `formateEventTime` / date-fns output in Task 3 to minimize label churn.
- `TimePicker` a11y roles in tests must match implementation (update test selectors in the same task).
