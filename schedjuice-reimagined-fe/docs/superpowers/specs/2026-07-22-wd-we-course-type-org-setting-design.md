# WD/WE course type org setting

## Goal

Give org owners a single on/off setting to enable or disable WD/WE course-type terminology, without introducing a new backend column.

## Decisions

| Choice | Decision |
| --- | --- |
| UX | Single boolean switch (not full course-fields editor) |
| Off behavior | Remove `"course_type"` from `Organization.course_fields` (full gate, not scheduling-only) |
| Placement | Reports and billing, near FM/HM course display |
| Storage | Virtual switch over existing `course_fields` array |

## Behavior

**Label:** Use WD/WE course types  

**Description:** When on, scheduling uses WD (Mon–Thu) and WE (Sat–Sun) instead of individual weekdays. Friday stays on Custom schedule.

| Switch | `course_fields` effect |
| --- | --- |
| On | Ensure `"course_type"` is present (append once if missing; keep other fields and order) |
| Off | Remove `"course_type"` only; leave all other entries unchanged |

**Runtime:** Existing `orgUsesWdWeNomenclature(courseFields)` continues to gate scheduling UI. No consumer changes required beyond org form wiring.

**Existing course rows:** Do not backfill or clear `Course.course_type` when the switch changes.

## Architecture

### Data

- Source of truth: `Organization.course_fields` (unchanged model / no migration).
- Backend already accepts and validates `course_fields` on org update.

### Frontend form

1. Include `course_fields` on `organizationOwnerEditSchema` (stop omitting it).
2. Add `course_fields` to the Reports and billing section keys in `organization-profile-sections.ts`.
3. Load `course_fields` into the org record form (remove the current skip that ignores that key).
4. Custom `fieldConfig` for `course_fields`: render a Switch bound to whether the array includes `"course_type"`; toggling mutates the array via small helpers.
5. Section save already JSON-stringifies non-domain arrays in FormData; include `course_fields` in the reports-billing payload.

### Helpers

Keep next to `orgUsesWdWeNomenclature` in `simple-schedule.ts` (or a tiny adjacent helper module if preferred for cohesion):

- `courseFieldsUseWdWe(fields)` → boolean
- `courseFieldsWithWdWe(fields, enabled)` → next array (null/undefined → treat as `[]`)

### After save

Refresh tenant/org client state the same way other org flag saves do, so scheduling UI reflects the change without a hard reload.

## Edge cases

- `course_fields` null/empty on load → treat as `[]`; switch off; turning on saves `["course_type"]` (do not invent a full default field list).
- No duplicate `"course_type"` when turning on while already present.
- Invalid names: only send the org’s current list ± `course_type`; BE validation remains the backstop.

## Errors

- Save failures use the existing org section error toast.
- No new error surfaces.

## Testing

High-value only:

- Helper unit tests: enable/disable membership without disturbing other fields; null → `[]` behavior.
- Optional thin: `pickOrgSectionValues("reports-billing", …)` includes `course_fields`.

Do **not** add happy-path “switch renders” UI smoke tests.

## Out of scope

- Full Course Fields editor UI
- New Organization boolean column
- Changing FM/HM behavior
- Data-sheet layout changes beyond what `course_fields` / `course_type` already imply
- Clearing or migrating existing `Course.course_type` values

## Lofi placement

```
Reports and billing
───────────────────
[ ] FM/HM course display
[x] Use WD/WE course types
    When on, scheduling uses WD / WE …
```
