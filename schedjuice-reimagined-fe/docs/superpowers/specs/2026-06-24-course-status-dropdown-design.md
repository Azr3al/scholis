# Course Record — Status Badge Dropdown — Design Spec

> Hide course status action buttons behind a clickable status badge dropdown on the course record identity strip.

**Status:** Design approved (brainstorming 2026-06-24).
**Authority:** [`DESIGN.md`](../../../DESIGN.md).
**Predecessor:** Course record UI fixes — `2026-06-24-course-record-ui-fixes-design.md` (introduced inline status actions in identity strip).

---

## 1. Context

The course record identity strip currently shows the status badge and action buttons (`Pause Course`, `End Course`, etc.) side by side for users with `canManuallyChangeCourseStatus`. This clutters the header and exposes destructive actions at all times.

**Current layout** (`course-record-identity-strip.tsx`):

```tsx
<StatusBadge status={course.status} />
{canManageStatus ? <CourseRecordStatusActions course={course} /> : null}
```

`CourseRecordStatusActions` renders always-visible outline buttons with icons. End and Reactivate open confirmation/dialog flows; Pause and Resume fire immediately.

---

## 2. Goals & non-goals

### Goals

1. **Minimal default UI** — only the status badge is visible in the identity strip status row.
2. **Actions on demand** — status mutations appear in a dropdown when the badge is clicked (managers only).
3. **Consistent for all statuses** — Reactivate (ended) is also behind the badge, not a standalone button.
4. **Preserve existing behavior** — same permissions, mutations, toasts, and confirmation dialogs.
5. **Discoverable trigger** — badge shows a chevron and interactive affordance when clickable.

### Non-goals

- Backend or permission changes.
- Moving actions to the course overflow menu.
- Inline expand/collapse of buttons.
- Reskinning End/Reactivate dialogs.
- Changing `StatusBadge` appearance on non-record surfaces (lists, cards, etc.).

---

## 3. Locked decisions

| # | Decision |
| --- | --- |
| 1 | **Interaction:** Click status badge → dropdown menu (Option A from brainstorming) |
| 2 | **Reactivate:** Behind badge when ended (consistent minimal UI) |
| 3 | **Read-only users:** Badge unchanged — no chevron, not clickable, no dropdown |
| 4 | **Component ownership:** `CourseRecordStatusActions` owns badge + dropdown + dialogs; identity strip renders one component |

---

## 4. Interaction model

### 4.1 Default (all users)

Single status badge (`Active`, `Paused`, `Planned`, `Ended`) with current styling (`border={false}`, `bg={false}`).

### 4.2 Managers (`canManageStatus`)

Badge becomes a dropdown trigger:

- Wrapped in `DropdownMenu` / `DropdownMenuTrigger`.
- Trigger is a `<button>` containing `StatusBadge` + `ChevronDown` (opacity ~70%, matches profile masthead pattern).
- Hover/focus ring on trigger; `cursor-pointer`.
- `aria-label`: e.g. `"Course status actions"`.

Click opens menu aligned to start under the badge.

### 4.3 Menu items by status

| Status | Items | Behavior |
| --- | --- | --- |
| **Active** | Pause course · End course | Pause: immediate mutation. End: opens existing `AlertDialog`. |
| **Paused** | Resume course · End course | Resume: immediate. End: `AlertDialog`. |
| **Planned** | End course | End: `AlertDialog`. |
| **Ended** | Reactivate course | Opens existing reactivate `Dialog` with date pickers. |

Destructive item (`End course`) uses destructive text styling (`text-destructive focus:bg-destructive/10`).

Menu items include the same Lucide icons as today: `CirclePause`, `StepForward`, `CircleX`, `RotateCcw`.

### 4.4 Pending state

While any status mutation is pending, all menu items are disabled (`disabled={isPending}`).

### 4.5 Keyboard & mobile

Standard Radix dropdown behavior: Enter/Space opens; arrows navigate; Escape closes. Tap opens on mobile.

---

## 5. Component structure

```
course-record-identity-strip.tsx
  └── CourseRecordStatusActions (canManageStatus, course)
        ├── [read-only] StatusBadge
        └── [manager]
              ├── DropdownMenu
              │     ├── Trigger: button(StatusBadge + ChevronDown)
              │     └── Content: menu items from getCourseStatusMenuItems(status)
              ├── AlertDialog (end course) — unchanged
              └── Dialog (reactivate) — unchanged
```

**New helper:** `getCourseStatusMenuItems(status: courseStatus)` — pure function returning which action keys to show. Unit-tested.

**Unchanged:** `pauseCourse`, `resumeCourse`, `endCourse`, `reactivateCourse` API calls; `invalidateCourseSummaryCaches`; toast messages.

---

## 6. Visual details

- Trigger button: `inline-flex items-center gap-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`.
- No layout shift — badge size unchanged; chevron adds ~16px width only when manager.
- Dropdown width: `min-w-[10rem]`; items use `gap-2` with icon + label.

---

## 7. Testing

| Test | Type |
| --- | --- |
| `getCourseStatusMenuItems` returns correct keys per status | Unit (Vitest) |
| Read-only render: badge only, no trigger button | Component (Vitest + RTL) optional |
| Manual: active course → badge click → pause/end visible; end opens confirm | Manual QA |

---

## 8. Files touched

| File | Change |
| --- | --- |
| `src/components/course/record/course-record-status-actions.tsx` | Refactor to dropdown; absorb badge; keep dialogs/mutations |
| `src/components/course/record/course-record-identity-strip.tsx` | Single `CourseRecordStatusActions` with `canManageStatus` prop; remove separate `StatusBadge` |
| `src/lib/course-status-menu-items.ts` | New pure helper + test |

---

## 9. Acceptance criteria

1. Identity strip status row shows **badge only** (no inline action buttons) for all users.
2. Users with `canManageStatus` can click the badge to open a dropdown with status-appropriate actions.
3. End course and Reactivate course still require confirmation/dialog before mutation.
4. Pause/Resume still mutate immediately from menu selection.
5. Users without `canManageStatus` see a non-interactive badge identical to today.
6. Unit tests pass for menu item helper.
