# Inline Schedule on Single-Course Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show optional `SimpleSchedulePicker` under single-course create forms; on submit create the course then optionally materialize sessions via `edit-events`, and open the edit Schedule tab.

**Architecture:** Pure FE helpers expand `RecurringSlot[]` with `addRecurringEvents`, then a shared `createCourseThenOptionalSchedule` does `POST courses` → optional `POST courses/{id}/edit-events`. Wire into `ManualCourseForm` and single-row `ExistingIntakeAddForm`. Bind course edit `Tabs.Root` to `?tab=`.

**Tech Stack:** Next.js client components, Vitest (`bun run test:unit`), existing `SlotsSimpleScheduleField`, `helpers/calendar.ts`, `makePostRequest`.

**Spec:** `docs/superpowers/specs/2026-07-21-inline-schedule-on-course-create-design.md`

## Global Constraints

- Scope: manual create + single-course add-to-existing-intake only (not bulk intake, not `ExistingIntakeAddFormMulti`).
- Schedule optional: empty `RecurringSlot[]` → create only, no `edit-events`.
- No backend API changes; reuse `POST courses` and `POST courses/{id}/edit-events` with body `{ course, events }`.
- After success (including partial schedule failure): always redirect to `/courses/{id}/edit?tab=edit-schedule&ref=...`.
- Partial failure toast title: `Course created, but sessions could not be added`.
- Default picker: org session time defaults, **no weekdays selected** (`slots = []`).
- Weekday labels: `weekdayNames` = `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`.
- High-value tests only (no “picker renders” smoke).
- FE tests: `bun run test:unit -- <path>`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/helpers/create-course-schedule.ts` | Create | Validate slots; expand slots → events; `createCourseThenOptionalSchedule` |
| `src/helpers/create-course-schedule.test.ts` | Create | High-value unit tests for helper |
| `src/components/scheduling/manual-course-form.tsx` | Modify | Optional schedule UI + use helper on submit |
| `src/components/scheduling/existing-intake-add-form.tsx` | Modify | Schedule UI when `rows.length === 1`; apply helper for single create |
| `src/app/(internal)/courses/[id]/edit/page.tsx` | Modify | Control `Tabs.Root` from `?tab=` |

---

### Task 1: Slot validation + expand helpers

**Files:**
- Create: `src/helpers/create-course-schedule.ts`
- Create: `src/helpers/create-course-schedule.test.ts`

**Interfaces:**
- Consumes: `RecurringSlot` from `@/types/intake`; `addRecurringEvents`, `isClassTimeRangeValid` from `@/helpers/calendar`; `weekdayNames` from `@/components/calendar/types`; `eventType` from `@/types/course`
- Produces:
  - `validateRecurringSlotsForCreate(slots: RecurringSlot[]): string | null` — `null` if empty or valid; else human-readable error
  - `expandSlotsToCourseEvents(args: { slots: RecurringSlot[]; startDate: Date; endDate: Date; title: string }): eventType[]`

- [ ] **Step 1: Write the failing tests**

Create `src/helpers/create-course-schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  expandSlotsToCourseEvents,
  validateRecurringSlotsForCreate,
} from "./create-course-schedule";

describe("validateRecurringSlotsForCreate", () => {
  it("allows empty slots", () => {
    expect(validateRecurringSlotsForCreate([])).toBeNull();
  });

  it("rejects slot with missing weekday", () => {
    expect(
      validateRecurringSlotsForCreate([
        { weekday: "", time_from: "19:00", time_to: "20:30" },
      ]),
    ).toMatch(/weekday|day/i);
  });

  it("rejects invalid time range", () => {
    expect(
      validateRecurringSlotsForCreate([
        { weekday: "Mon", time_from: "20:00", time_to: "19:00" },
      ]),
    ).toMatch(/time/i);
  });
});

describe("expandSlotsToCourseEvents", () => {
  it("expands one weekday across the date span", () => {
    const events = expandSlotsToCourseEvents({
      slots: [{ weekday: "Mon", time_from: "19:00", time_to: "20:30" }],
      startDate: new Date(2026, 6, 6), // Mon Jul 6 2026
      endDate: new Date(2026, 6, 20), // Mon Jul 20 2026
      title: "Algebra",
    });
    const dates = events.map((e) => e.date).sort();
    expect(dates).toEqual(["2026-07-06", "2026-07-13", "2026-07-20"]);
    expect(events.every((e) => e.time_from === "19:00" && e.time_to === "20:30")).toBe(
      true,
    );
    expect(events.every((e) => e.title === "Algebra")).toBe(true);
  });

  it("expands multiple slots with different times", () => {
    const events = expandSlotsToCourseEvents({
      slots: [
        { weekday: "Mon", time_from: "09:00", time_to: "10:00" },
        { weekday: "Wed", time_from: "14:00", time_to: "15:30" },
      ],
      startDate: new Date(2026, 6, 6),
      endDate: new Date(2026, 6, 9), // Thu
      title: "Science",
    });
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.date === "2026-07-06")?.time_from).toBe("09:00");
    expect(events.find((e) => e.date === "2026-07-08")?.time_from).toBe("14:00");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/helpers/create-course-schedule.test.ts`

Expected: FAIL (module / exports not found)

- [ ] **Step 3: Implement helpers**

Create `src/helpers/create-course-schedule.ts`:

```ts
import { weekdayNames } from "@/components/calendar/types";
import {
  addRecurringEvents,
  isClassTimeRangeValid,
} from "@/helpers/calendar";
import type { eventType } from "@/types/course";
import type { RecurringSlot } from "@/types/intake";

export function validateRecurringSlotsForCreate(
  slots: RecurringSlot[],
): string | null {
  if (!slots.length) return null;
  for (const slot of slots) {
    if (!slot.weekday || !weekdayNames.includes(slot.weekday)) {
      return "Each session needs a valid weekday.";
    }
    if (!isClassTimeRangeValid(slot.time_from, slot.time_to)) {
      return "Each session needs a valid start and end time.";
    }
  }
  return null;
}

export function expandSlotsToCourseEvents({
  slots,
  startDate,
  endDate,
  title,
}: {
  slots: RecurringSlot[];
  startDate: Date;
  endDate: Date;
  title: string;
}): eventType[] {
  const events: eventType[] = [];
  for (const slot of slots) {
    events.push(
      ...addRecurringEvents(
        startDate,
        endDate,
        [slot.weekday],
        {},
        false,
        title,
        slot.time_from,
        slot.time_to,
      ),
    );
  }
  return events;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/helpers/create-course-schedule.test.ts`

Expected: PASS

If date ISO strings differ due to timezone, adjust expected dates using `getDateISOString` the same way `addRecurringEvents` does — do **not** invent a second date formatter.

- [ ] **Step 5: Commit**

```bash
git add src/helpers/create-course-schedule.ts src/helpers/create-course-schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(scheduling): expand optional create slots to events

EOF
)"
```

---

### Task 2: `createCourseThenOptionalSchedule`

**Files:**
- Modify: `src/helpers/create-course-schedule.ts`
- Modify: `src/helpers/create-course-schedule.test.ts`

**Interfaces:**
- Consumes: `makePostRequest` from `@/app/client-api/utils`; `sanitizeCoursePayloadForApiWrite` from `@/helpers/course-program-validation`; `cleanDatesForBackend` from `@/helpers/date` (same as calendar save); Task 1 helpers
- Produces:
  ```ts
  export type CreateCourseScheduleResult = {
    courseId: number;
    course: Record<string, unknown>;
    scheduleApplied: boolean;
    scheduleError?: string;
  };

  export async function createCourseThenOptionalSchedule(args: {
    coursePayload: Record<string, unknown>;
    slots: RecurringSlot[];
    title: string;
    startDate: Date;
    endDate: Date;
  }): Promise<CreateCourseScheduleResult>
  ```
- Behavior:
  1. If `validateRecurringSlotsForCreate(slots)` returns a string → **throw** that string (or throw `Error` with that message) **before** any network call.
  2. `POST courses` with `coursePayload`.
  3. Read `id` from `res.data.data.id`; throw if missing.
  4. If `slots.length === 0` → return `{ courseId, course: res.data.data, scheduleApplied: false }`.
  5. Else expand events; `POST courses/{id}/edit-events` with `{ course: sanitizedCourse, events }` where `course` is `cleanDatesForBackend(sanitizeCoursePayloadForApiWrite(createdCourse), ["start_date","end_date"])` matching calendar Save.
  6. On `edit-events` failure → return `{ courseId, course, scheduleApplied: false, scheduleError: "Course created, but sessions could not be added" }` (do not throw).
  7. On success → `{ courseId, course, scheduleApplied: true }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/helpers/create-course-schedule.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
}));

import { makePostRequest } from "@/app/client-api/utils";
import {
  createCourseThenOptionalSchedule,
  expandSlotsToCourseEvents,
  validateRecurringSlotsForCreate,
} from "./create-course-schedule";

describe("createCourseThenOptionalSchedule", () => {
  beforeEach(() => {
    vi.mocked(makePostRequest).mockReset();
  });

  it("creates only when slots are empty", async () => {
    vi.mocked(makePostRequest).mockResolvedValueOnce({
      data: { data: { id: 42, title: "A", start_date: "2026-07-01", end_date: "2026-07-31" } },
    } as never);

    const result = await createCourseThenOptionalSchedule({
      coursePayload: { title: "A" },
      slots: [],
      title: "A",
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 31),
    });

    expect(makePostRequest).toHaveBeenCalledTimes(1);
    expect(makePostRequest).toHaveBeenCalledWith("courses", { title: "A" });
    expect(result).toMatchObject({
      courseId: 42,
      scheduleApplied: false,
    });
    expect(result.scheduleError).toBeUndefined();
  });

  it("posts edit-events after create when slots are set", async () => {
    const created = {
      id: 7,
      title: "B",
      start_date: "2026-07-06",
      end_date: "2026-07-20",
    };
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({ data: { data: created } } as never)
      .mockResolvedValueOnce({ data: { data: [] } } as never);

    const slots = [{ weekday: "Mon", time_from: "19:00", time_to: "20:30" }];
    const result = await createCourseThenOptionalSchedule({
      coursePayload: { title: "B" },
      slots,
      title: "B",
      startDate: new Date(2026, 6, 6),
      endDate: new Date(2026, 6, 20),
    });

    expect(makePostRequest).toHaveBeenNthCalledWith(1, "courses", { title: "B" });
    expect(makePostRequest).toHaveBeenNthCalledWith(
      2,
      "courses/7/edit-events",
      expect.objectContaining({
        events: expect.any(Array),
        course: expect.any(Object),
      }),
    );
    const body = vi.mocked(makePostRequest).mock.calls[1][1] as {
      events: Array<{ date: string }>;
    };
    expect(body.events.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ courseId: 7, scheduleApplied: true });
  });

  it("returns scheduleError and still yields courseId when edit-events fails", async () => {
    vi.mocked(makePostRequest)
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 9,
            title: "C",
            start_date: "2026-07-06",
            end_date: "2026-07-20",
          },
        },
      } as never)
      .mockRejectedValueOnce(new Error("boom"));

    const result = await createCourseThenOptionalSchedule({
      coursePayload: { title: "C" },
      slots: [{ weekday: "Mon", time_from: "19:00", time_to: "20:30" }],
      title: "C",
      startDate: new Date(2026, 6, 6),
      endDate: new Date(2026, 6, 20),
    });

    expect(result.courseId).toBe(9);
    expect(result.scheduleApplied).toBe(false);
    expect(result.scheduleError).toBe(
      "Course created, but sessions could not be added",
    );
  });

  it("does not create when slots are invalid", async () => {
    await expect(
      createCourseThenOptionalSchedule({
        coursePayload: { title: "D" },
        slots: [{ weekday: "Mon", time_from: "20:00", time_to: "19:00" }],
        title: "D",
        startDate: new Date(2026, 6, 6),
        endDate: new Date(2026, 6, 20),
      }),
    ).rejects.toThrow(/time/i);
    expect(makePostRequest).not.toHaveBeenCalled();
  });
});
```

Move the `vi.mock` to the **top** of the file (before imports of the module under test), matching `program-structure-create.test.ts`. Keep Task 1 describe blocks in the same file.

- [ ] **Step 2: Run tests to verify new cases fail**

Run: `bun run test:unit -- src/helpers/create-course-schedule.test.ts`

Expected: FAIL on missing `createCourseThenOptionalSchedule`

- [ ] **Step 3: Implement `createCourseThenOptionalSchedule`**

Append to `src/helpers/create-course-schedule.ts` (adjust imports to match repo):

```ts
import { makePostRequest } from "@/app/client-api/utils";
import { sanitizeCoursePayloadForApiWrite } from "@/helpers/course-program-validation";
import { cleanDatesForBackend } from "@/helpers/date";

export type CreateCourseScheduleResult = {
  courseId: number;
  course: Record<string, unknown>;
  scheduleApplied: boolean;
  scheduleError?: string;
};

export async function createCourseThenOptionalSchedule(args: {
  coursePayload: Record<string, unknown>;
  slots: RecurringSlot[];
  title: string;
  startDate: Date;
  endDate: Date;
}): Promise<CreateCourseScheduleResult> {
  const slotError = validateRecurringSlotsForCreate(args.slots);
  if (slotError) throw new Error(slotError);

  const createRes = await makePostRequest("courses", args.coursePayload);
  const course = (createRes?.data?.data ?? {}) as Record<string, unknown>;
  const courseId = course.id as number | undefined;
  if (courseId == null) {
    throw new Error("Course create response missing id");
  }

  if (!args.slots.length) {
    return { courseId, course, scheduleApplied: false };
  }

  const events = expandSlotsToCourseEvents({
    slots: args.slots,
    startDate: args.startDate,
    endDate: args.endDate,
    title: args.title,
  });

  const sanitized = sanitizeCoursePayloadForApiWrite(course);
  const courseForEdit = cleanDatesForBackend(sanitized, [
    "start_date",
    "end_date",
  ]);

  try {
    await makePostRequest(`courses/${courseId}/edit-events`, {
      course: courseForEdit,
      events,
    });
    return { courseId, course, scheduleApplied: true };
  } catch {
    return {
      courseId,
      course,
      scheduleApplied: false,
      scheduleError: "Course created, but sessions could not be added",
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/helpers/create-course-schedule.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/helpers/create-course-schedule.ts src/helpers/create-course-schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(scheduling): create course then optional edit-events schedule

EOF
)"
```

---

### Task 3: Wire `ManualCourseForm`

**Files:**
- Modify: `src/components/scheduling/manual-course-form.tsx`

**Interfaces:**
- Consumes: `SlotsSimpleScheduleField`, `courseTypeFromSlots` from `@/components/scheduling/slots-simple-schedule-field`; `createCourseThenOptionalSchedule` from Task 2; `orgUsesWdWeNomenclature` / course fields as needed
- Produces: UI + submit behavior per spec

- [ ] **Step 1: Add schedule state and UI**

In `ManualCourseForm`:

1. `const [slots, setSlots] = useState<RecurringSlot[]>([]);`
2. `const [scheduleError, setScheduleError] = useState<string | null>(null);`
3. Inside the existing **Schedule** section (after date presets, before Details), add:

```tsx
<div className="space-y-2">
  <h3 className="text-sm font-medium text-text-primary">
    Weekly sessions (optional)
  </h3>
  <p className="text-sm text-text-muted">
    Leave days empty to create the class without sessions. You can add them on
    the Schedule tab next.
  </p>
  <SlotsSimpleScheduleField
    slots={slots}
    onChange={(next) => {
      setSlots(next);
      setScheduleError(null);
    }}
    idPrefix="manual-create"
  />
  {scheduleError ? (
    <p className="text-sm text-destructive" role="alert">
      {scheduleError}
    </p>
  ) : null}
</div>
```

Do **not** put default Mon slots — keep `[]` so the picker shows org times with no days selected (`SlotsSimpleScheduleField` already falls back to `createDefaultSimpleValue` when `slots` is empty).

- [ ] **Step 2: Replace create mutation success path with helper**

Change submit so `onSubmit` builds the same course `payload` as today, then:

```ts
// before mutate:
const slotErr = validateRecurringSlotsForCreate(slots);
if (slotErr) {
  setScheduleError(slotErr);
  return;
}

if (
  orgUsesWdWeNomenclature(courseFields) ||
  (courseFields ?? []).includes("course_type")
) {
  const ct = courseTypeFromSlots(slots);
  if (ct) payload.course_type = ct;
}

createMutation.mutate({ payload, slots });
```

Update mutation:

```ts
const createMutation = useMutation({
  mutationFn: async ({
    payload,
    slots: submitSlots,
  }: {
    payload: Record<string, unknown>;
    slots: RecurringSlot[];
  }) => {
    const start = payload.start_date
      ? new Date(payload.start_date as string)
      : null;
    const end = payload.end_date ? new Date(payload.end_date as string) : null;
    if (!start || !end) {
      throw new Error("Start and end dates are required");
    }
    return createCourseThenOptionalSchedule({
      coursePayload: payload,
      slots: submitSlots,
      title: String(payload.title ?? ""),
      startDate: start,
      endDate: end,
    });
  },
  onError: (err) => {
    if (err instanceof Error && /weekday|time|session/i.test(err.message)) {
      setScheduleError(err.message);
      return;
    }
    const applied = setFormErrrors(err, form);
    if (applied) scheduleScrollToFirstFormError(form);
  },
  onSuccess: (result) => {
    if (result.scheduleError) {
      toast.add({ type: "error", title: result.scheduleError });
    } else {
      toast.add({ title: "Course created" });
    }
    queryClient.refetchQueries({ queryKey: ["searchcourses"] });
    router.push(
      `/courses/${result.courseId}/edit?tab=edit-schedule&ref=/courses`,
    );
  },
});
```

Keep Microsoft / exam_session_date payload logic unchanged.

- [ ] **Step 3: Smoke-check types / lint on the file**

Run: `bun run test:unit -- src/helpers/create-course-schedule.test.ts`

Expected: PASS (no regression)

- [ ] **Step 4: Commit**

```bash
git add src/components/scheduling/manual-course-form.tsx
git commit -m "$(cat <<'EOF'
feat(scheduling): optional weekly sessions on manual course create

EOF
)"
```

---

### Task 4: Wire `ExistingIntakeAddForm` (single row only)

**Files:**
- Modify: `src/components/scheduling/existing-intake-add-form.tsx`

**Interfaces:**
- Consumes: Task 2 helper; `SlotsSimpleScheduleField`; intake dates via `buildCoursePayloadFromIntakeDefaults` / `parseIntakeGenerationDefaults`
- Produces: schedule UI only when `rows.length === 1`; schedule applied only for single-course create

- [ ] **Step 1: Add slots state + conditional UI**

```ts
const [slots, setSlots] = useState<RecurringSlot[]>([]);
const [scheduleError, setScheduleError] = useState<string | null>(null);
```

When `rows.length === 1`, render the same “Weekly sessions (optional)” block (before the create button). When `rows.length > 1`, clear/hide schedule (set slots to `[]` in an effect when length becomes > 1, or simply ignore slots on multi create).

- [ ] **Step 2: Apply helper for single-course create**

In `createCourses.mutationFn`, after building `payload` for the single row path:

When `draftRows.length === 1`:

```ts
const start = new Date(String(payload.start_date));
const end = new Date(String(payload.end_date));
const result = await createCourseThenOptionalSchedule({
  coursePayload: payload,
  slots,
  title: String(payload.title ?? row.title),
  startDate: start,
  endDate: end,
});
return { createdIds: [result.courseId], scheduleError: result.scheduleError };
```

When `draftRows.length > 1`, keep today’s loop of `makePostRequest("courses", payload)` only (no schedule). Return `{ createdIds, scheduleError: undefined }`.

Update `onSuccess`:

```ts
onSuccess: (result) => {
  const { createdIds, scheduleError } = result;
  if (scheduleError) {
    toast.add({ type: "error", title: scheduleError });
  } else {
    toast.add({
      title:
        createdIds.length === 1
          ? "Course created"
          : `${createdIds.length} courses created`,
    });
  }
  if (createdIds.length === 1) {
    router.push(
      `/courses/${createdIds[0]}/edit?tab=edit-schedule&ref=/intakes/${intakeId}`,
    );
    return;
  }
  router.push(`/intakes/${intakeId}`);
},
```

Validate slots before create when `draftRows.length === 1` and surface `scheduleError` inline on failure (same as manual).

- [ ] **Step 3: Commit**

```bash
git add src/components/scheduling/existing-intake-add-form.tsx
git commit -m "$(cat <<'EOF'
feat(scheduling): optional weekly sessions on single intake-add create

EOF
)"
```

---

### Task 5: Bind course edit tabs to `?tab=`

**Files:**
- Modify: `src/app/(internal)/courses/[id]/edit/page.tsx` (around `Tabs.Root` ~L664 and existing `activeTab` ~L132)

**Interfaces:**
- Consumes: existing `activeTab = searchParams.get("tab") ?? "edit-info"`
- Produces: controlled tabs so `?tab=edit-schedule` opens Schedule

- [ ] **Step 1: Control Tabs from URL**

Replace:

```tsx
<Tabs.Root defaultValue="edit-info">
```

with:

```tsx
<Tabs.Root
  value={activeTab}
  onValueChange={(next) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "edit-info") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }}
>
```

Use the same `router` already imported on the page. If Base UI’s `onValueChange` passes an event object instead of a string, adapt to the real signature (check `@base-ui/react/tabs` types in node_modules or other controlled `Tabs.Root` usages in the repo).

Ensure restricted-tab redirect logic still works with controlled `value={activeTab}` (it already rewrites `tab` in search params).

- [ ] **Step 2: Manual verification checklist (no new low-value render test)**

1. Open `/courses/{id}/edit?tab=edit-schedule` → Schedule panel visible.
2. Click Information → URL drops/clears `tab` or sets `edit-info`.
3. After manual create with empty slots → lands on Schedule tab empty.
4. After manual create with Mon 19:00–20:30 → Schedule tab shows expanded sessions (or after save path, events present).

- [ ] **Step 3: Commit**

```bash
git add src/app/(internal)/courses/[id]/edit/page.tsx
git commit -m "$(cat <<'EOF'
fix(courses): honor edit?tab= for schedule deep links

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Optional `SlotsSimpleScheduleField` under create | 3, 4 |
| Empty slots → create only | 2 |
| Slots → expand + `edit-events` | 1, 2 |
| Partial failure toast + still redirect | 2, 3, 4 |
| Redirect `?tab=edit-schedule` | 3, 4 |
| Tab deep-link actually opens Schedule | 5 |
| Manual + single intake-add only | 3, 4 |
| No BE / bulk intake / multi-add | (none) |
| High-value tests | 1, 2 |

No placeholders remaining after fixing helper names and `edit-events` body shape.
