# Org Time Format, Styled Time Picker & Date Picker Contrast — Design Spec

**Date:** 2026-07-21  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`  
**Approach:** Org `time_display_format` (default `12h`) + shared format helpers; custom popover `TimePicker` for schedule fields; calendar selected/outside-day contrast fix

## 1. Summary

Native `<input type="time">` popovers cannot match Schedjuice cream/action tokens (OS blue selection). Date picker selected days show dark text on dark green because ghost `text-text-primary` wins over `text-primary-foreground`. Time display is inconsistent today (`formatTime` → 24h, `formateEventTime` / `formatSessionClock` → 12h) with no org preference.

Ship:

1. Organization setting **Time display format**: `12h` | `24h`, default **`12h`**.
2. Shared FE format helpers used by **pickers and displayed times**.
3. Custom **TimePicker** popover replacing schedule `type="time"` inputs.
4. Date **Calendar** contrast fixes (selected + outside-month days).

## 2. Context

### Pain

| Surface | Problem |
| --- | --- |
| Simple / custom schedule From–To | Native time UI clashes with form chrome |
| Date picker (`react-day-picker`) | Selected day: dark text on `--action` green; outside days: `opacity-50` on muted text |
| Displays | Mixed 12h/24h with no tenant control |

### Existing pieces

| Piece | Path | Notes |
| --- | --- | --- |
| 12h segment helpers | `schedjuice-reimagined-fe/src/helpers/time-12h.ts` | HH:mm ↔ 12h segments |
| Calendar TimeSelect | `components/calendar/time-select.tsx` | Hardcoded 12h selects |
| InlineTimeSelect | `components/datatable/inline-time-select.tsx` | Hardcoded 12h |
| DateTimePicker copies | `components/date/`, `courses/ui/`, `app/_chrome/` | Hardcoded AM/PM |
| Session clocks | `formatSessionClock`, `formateEventTime` in `helpers/date.ts` | Always 12h |
| `formatTime` | `helpers/date.ts` | Always 24h `HH:mm` |
| Org Region section | `config/organization-profile-sections.ts` | Natural home next to `timezone` |
| Schedule `type="time"` | `simple-schedule-picker.tsx`, `recurring-slots-editor.tsx` | Only two call sites |

### Persistence (unchanged)

API and DB continue to store times as 24-hour `HH:mm` / `HH:mm:ss` (and ISO datetimes). Preference affects **display and input chrome only**.

## 3. Goals

1. Org admins choose 12-hour or 24-hour display; default **12-hour** for new and existing orgs (migration default).
2. Preferenced format applies to **time pickers and human-readable time labels** across the FE.
3. Schedule From/To use a branded custom TimePicker (not native OS chrome).
4. Date picker selected day text meets AA contrast on action green; outside-month days remain secondary but readable.
5. No change to stored values, overlap math, or backend time interpretation.

## 4. Non-goals

- User-level (per-account) time format override.
- Email / PDF / mobile native apps unless they already share these FE helpers.
- Restyling native `<input type="time">` (impossible for the popover).
- Changing media player duration clocks (`formatTime(seconds)` in recording player).
- Rewriting calendar week axis hour labels beyond using the shared formatter where already centralized.
- Syncing duplicate chrome/courses calendar copies beyond applying the same contrast classes where those files define day styles.

## 5. Locked decisions

| Topic | Choice |
| --- | --- |
| Setting name | `time_display_format` |
| Values | `"12h"` \| `"24h"` |
| Default | `"12h"` |
| Scope | Pickers **and** displayed times (option 3) |
| TimePicker UX | Custom popover: hour + minute columns; 12h adds AM/PM column |
| Minute step | `1` (match native) |
| Storage | Unchanged 24h strings |
| Missing / unknown format | Treat as `"12h"` |
| Org UI placement | Region and currency, next to `timezone` |
| Schedule wiring | Replace both `type="time"` sites with `TimePicker` |
| Date contrast | Selected: action tokens that beat ghost text; outside: muted without extra `opacity-50` |

## 6. Architecture

### 6.1 Backend — Organization field

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

- Next migration after `0078` (e.g. `0079_organization_time_display_format`).
- `OrganizationSerializer` auto-includes via exclude-based Meta; public org payload must expose the field (same as other org columns already on public).
- No cross-field validation required.

### 6.2 Frontend — Org types & settings UI

- Enum `TimeDisplayFormat` (`"12h"` | `"24h"`) in `types/organization.ts`.
- Zod field on `organizationFieldsSchema` with `.default(TimeDisplayFormat["12h"])`.
- Add key to `region-currency` section in `organization-profile-sections.ts`.
- Optional field description in `use-org-record-form.tsx`: “How times appear in calendars, schedules, and labels.”
- AutoForm `ZodNativeEnum` → select (labels from `.describe` / enum display strings).

### 6.3 Shared format helpers

Extend `helpers/time-12h.ts` **or** add `helpers/time-format.ts` that re-exports / wraps it:

| API | Behavior |
| --- | --- |
| `TimeDisplayFormat` type | `"12h" \| "24h"` |
| `resolveTimeDisplayFormat(raw)` | Unknown/null → `"12h"` |
| `formatOrgTime(raw, format)` | Session-like strings → `"7:00 PM"` or `"19:00"` |
| `formatOrgTimeRange(from, to, format)` | `"7:00 PM – 8:30 PM"` / `"19:00 – 20:30"` |

Wire existing entry points so call sites mostly stay put:

- `formateEventTime(time, format?)` and `formatSessionClock(raw, format?)` — optional second arg; default `"12h"`; when `"24h"`, use `HH:mm`.
- `formatTime` used for **clock labels** (not media seconds): either take optional format or route callers to `formatOrgTime`. Prefer updating `formatTime`’s clock usage carefully — do **not** break ISO datetime formatting callers without checking; prefer migrating clock call sites to `formatOrgTime` / updated `formatSessionClock`.

React surfaces: `const format = resolveTimeDisplayFormat(tenant?.time_display_format)` via `useTenant()`, pass into helpers and pickers.

### 6.4 Custom `TimePicker`

**File:** `schedjuice-reimagined-fe/src/components/date/time-picker.tsx`

**Props:**

```ts
type TimePickerProps = {
  id?: string;
  value: string; // HH:mm
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  className?: string;
  minuteStep?: number; // default 1
  timeDisplayFormat?: "12h" | "24h"; // default from tenant if omitted
};
```

**Behavior:**

- Trigger: `inputClassName` button showing formatted value + clock icon.
- Popover (`Popover` primitive): scrollable columns.
  - **24h:** hours `00–23`, minutes `00–59` (step).
  - **12h:** hours `1–12`, minutes, AM/PM.
- Selected cell: `--action` / `--action-foreground` (same pattern as primary `Button`).
- Surface: `bg-surface-elevated`, `border-border` — no OS blue.
- On change of any column, emit normalized `HH:mm` immediately.
- A11y: labelled trigger; Escape closes; columns are keyboard-scrollable lists.

**Consumers:**

- `simple-schedule-picker.tsx`
- `recurring-slots-editor.tsx`

Keep existing normalize / duration-preserve logic; only swap the control.

### 6.5 Existing pickers

| Control | Change |
| --- | --- |
| `TimeSelect` | When `24h`, hour `00–23` (or 0–23), no AM/PM column |
| `InlineTimeSelect` | Same; display label via `formatOrgTime` |
| DateTimePicker (date + chrome + courses copies) | Hide AM/PM in 24h; format trigger string per preference |

Read format from `useTenant()` inside these components (or accept optional prop for tests).

### 6.6 Display migration

Centralize through `formatSessionClock` / `formateEventTime` / `formatOrgTime` so cards, shortcuts, calendars, check-in history, overlap sheets, payroll checkin columns, etc. pick up the preference when callers pass `tenant` format.

**Explicitly in scope:** any FE user-visible clock that today hardcodes `hh:mm a` or `HH:mm` for **session / event / check-in times**.

**Out of scope examples:** media duration `mm:ss`; pure date labels without time; server-generated PDFs.

Pattern for React:

```tsx
const { tenant } = useTenant();
const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
// ...
formatSessionClock(event.time_from, timeFormat)
```

For helpers that cannot use hooks, require the format argument from the caller.

### 6.7 Date Calendar contrast

Primary file: `components/date/calendar.tsx`.

- **day_selected:** use explicit action CSS vars (as primary `Button`) so color wins over ghost `text-text-primary`:

  `bg-[var(--action,...)] text-[var(--action-foreground,#ffffff)]` (+ hover/focus same).

- **day_outside / day_disabled:** `text-text-muted` **without** `opacity-50` (or use a single muted token that already meets ~3:1 for large UI chrome; prefer readable muted over double-fading).

Apply the same selected/outside class changes to `app/_chrome/calendar.tsx` and `components/courses/ui/calendar.tsx` if they still define independent `day_*` classNames.

## 7. Data flow

```text
Organization.time_display_format
        │
        ▼
GET organizations/public → useTenant().tenant
        │
        ├─► TimePicker / TimeSelect / InlineTimeSelect / DateTimePicker
        │         └─ value always HH:mm (24h) in/out
        │
        └─► formatOrgTime / formatSessionClock / formateEventTime
                  └─ labels in lists, cards, calendars, attendance
```

## 8. Testing

### Backend

- Model default is `"12h"`.
- Partial PATCH accepts `"24h"` / `"12h"`; rejects invalid choice.

### Frontend (high-value)

- `resolveTimeDisplayFormat` / `formatOrgTime`: 12h/24h edges (`00:00`, `12:00`, `13:05`).
- TimePicker: emits `HH:mm` in both modes; 12h AM/PM round-trip (unit or component).
- Calendar: selected day classes include action-foreground / white text path (lightweight class assertion or visual QA note).
- Avoid happy-path-only “renders” smoke tests.

### Manual QA

- Org settings → Region: toggle 12h/24h, refetch tenant, confirm schedule picker + a session card + calendar event label flip.
- Date picker: selected day readable; outside days readable.

## 9. Rollout

1. BE field + migration (safe default `12h` — matches current majority of session clocks).
2. FE types + org settings UI.
3. Format helpers + plumb into existing formatters.
4. Calendar contrast (independent, can ship early).
5. TimePicker + schedule wiring.
6. TimeSelect / InlineTimeSelect / DateTimePickers.
7. Pass format through remaining display call sites that bypass updated helpers.

## 10. Open follow-ups (not blocking)

- Deduplicate chrome/courses `calendar.tsx` / `date-time-picker.tsx` copies.
- Calendar week-view left gutter hours currently use `convert12hourTo24hour` for axis — decide separately whether axis stays 24h always.
