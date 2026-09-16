# DVR Custom Fields (Form Designer) — Design Spec

**Date:** 2026-07-21  
**Status:** Pending user review  
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`  
**Approach:** Hybrid catalog + form-config verify path for custom fields (Approach 2)  
**Supersedes (partial):** Non-goal in `2026-07-18-data-verification-request-upgrade-design.md` that forbade expanding the DVR field catalog beyond `dvrFieldSchema` paths — that non-goal is lifted **only** for active `source=custom` user field definitions.

## 1. Summary

Data Verification Requests (DVRs) keep the existing ten built-in user columns and additionally let admins include **active form-designer custom fields** (`FieldDefinition` with `entity_type=app_auth.User`, `source=custom`). Create UI lists them under the built-ins; verify renders custom fields with the existing form-config / `FieldRenderer` stack and writes values into `User.custom_data`.

## 2. Goals

1. Admin create picker shows built-ins **plus** all active custom user field definitions.
2. Custom fields are preselected by default (`required: false`), same as built-ins.
3. Selected custom fields are editable on the verify form, including definitions marked `filled_by=admin` in the designer.
4. Verify omits custom fields whose definitions are no longer active (no error).
5. Backend create validation and required-field checks understand custom keys stored in `custom_data`.

## 3. Non-goals

- Replacing the fixed ten built-ins with a fully form-config-driven catalog.
- Filtering the create picker by role, `show_on_*`, or `filled_by`.
- Snapshotting full `FieldDefinition` JSON onto the DVR row.
- Live re-enrollment or editing DVR `fields` after create (unchanged from prior DVR upgrade).
- Course (or non-user) entity custom fields.

## 4. Locked decisions

| Topic | Choice |
| --- | --- |
| Catalog shape | Keep 10 built-ins; append active `source=custom` user definitions |
| Defaults | Built-ins + custom all selected; `required: false` |
| `filled_by` | Ignored for picker and verify editability |
| Inactive after create | Drop from verify silently; skip required check for that name |
| Storage in `fields[]` | Unchanged `{ name, required }`; custom `name` = bare `field_key` |
| Verify architecture | Built-ins stay on GenericForm + Zod; custom use FieldRenderer / form-config path |
| Write actor | Verifying user may write DVR-selected custom keys even if `filled_by=admin` |

## 5. Catalog & storage

### 5.1 Allowlist at create

- **Built-in:** existing fixed set in `app_auth/dvr.py` (`DVR_FIELD_CATALOG`):  
  `communication_email`, `alternative_name`, `date_of_birth`, `phone_number`, `house_number`, `street`, `township`, `city`, `region`, `country`.
- **Custom:** every active `FieldDefinition` with `entity_type=app_auth.User` and `source=custom`.

### 5.2 `fields[]` shape

```json
[
  { "name": "phone_number", "required": true },
  { "name": "employee_id", "required": false }
]
```

- Built-in `name` → top-level `User` column.
- Custom `name` → `User.custom_data[field_key]`.
- Reject duplicate names.
- Reject a custom `field_key` that collides with a built-in catalog name (defensive; should not occur for well-formed definitions).

### 5.3 Lifecycle

- Create validates names against the allowlist **at create time**.
- Later deactivation/deletion of a definition does **not** rewrite the DVR row.
- At verify time, inactive custom names are omitted from the form and from required-field enforcement.

## 6. Create UI

**File:** `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/create/page.tsx` (and small helpers as needed).

1. Keep the current built-in checkbox block.
2. Below it, load active user custom definitions via existing hooks/API (`useFieldDefinitions` / `custom-field-definitions`).
3. Render the same include + Required toggles; label = definition display name, fallback `field_key`.
4. Loading: skeleton/spinner for the custom block only; do not block the whole form.
5. Load failure: inline/toast error on the custom block; built-ins remain usable.
6. Defaults: start with `defaultDvrFieldConfigs()`; when custom definitions load successfully, append any missing `{ name: field_key, required: false }` for each active custom key (do not wipe admin toggles already changed).
7. Submit: single `fields` array of selected built-in + custom configs (existing shape).

Admin detail “Requested Fields” list: humanize built-ins; for custom show definition label when still active, else bare `field_key`.

## 7. Backend

**Primary files:** `app_auth/dvr.py`, `app_auth/serializers.py`, tests under `app_auth/tests/test_dvr.py`.

### 7.1 Validation

- `validate_dvr_fields`: name must be in `DVR_FIELD_CATALOG` **or** an active custom `field_key` for `ENTITY_TYPE_USER`.
- Unknown / inactive-at-create custom keys → `400` listing the names.
- Empty `fields` and duplicates → existing errors.

### 7.2 Required-field check

`user_missing_required_fields`:

- Built-in: `getattr(user, name)` (current behavior).
- Custom: `user.custom_data.get(name)` using the same emptiness helper as profile completeness (`_is_empty_value`).
- When checking for verify: if a required name is custom and its definition is **not** active, do not treat it as missing (aligns with “drop silently”).

### 7.3 Verify write exception

Normal user self-edit blocks writes to `filled_by=admin` custom keys. For DVR verify, allow the verifying user to write **only** custom keys on that DVR’s selected field list.

Implementation constraint: do not weaken ordinary `UserSerializer` self-edit. Prefer a dedicated verify submit path (or an explicit, authenticated context flag set only by the verify flow) that passes the DVR id / allowed keys into `validate_user_custom_data_for_write` so the exception is scoped to those keys for that request.

## 8. Verify UI & submit

**File:** `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/verify/page.tsx` (plus shared helpers under `lib/custom-fields` / `helpers/dvr` as needed).

### 8.1 Resolve fields at render

1. Normalize DVR `fields[]`.
2. Split built-in vs custom by membership in the fixed catalog.
3. Keep custom names only if an active `source=custom` definition exists.
4. If zero fields remain: show empty state (“No fields to verify”); do not submit verify.

### 8.2 Rendering

- **Built-ins:** existing `GenericForm` + `accountEditSchema.pick` / partial for non-required (unchanged pattern).
- **Custom:** filtered form-config / definitions → `buildConfigSchema` + `FieldRenderer` (or equivalent group sections used by `UserForm`), paths `custom_data.{field_key}`.
- DVR `required: true` overrides definition `required_at` for this form only.

### 8.3 Submit sequence

1. PATCH `users/{id}` with built-in top-level fields plus merged `custom_data` for edited custom keys (`collectGroupPayload`-style).
2. On success, PATCH `user-data-verification-requests` → `verified` (existing flow).
3. Do not mark verified if user PATCH fails or backend required check fails.

## 9. Testing

High-value only:

| Layer | Case |
| --- | --- |
| BE | Create accepts active custom `field_key`; rejects unknown/inactive |
| BE | `user_missing_required_fields` reads `custom_data`; skips inactive required custom |
| BE | Verify-path write allows user to set DVR-selected `filled_by=admin` custom key; ordinary self-edit still blocks |
| FE (optional if cheap) | Create defaults include custom keys; verify omit list drops inactive custom |

## 10. Out of scope follow-ups

- Migrating built-in DVR fields fully onto form-config.
- Admin UX to edit field list on an existing DVR after definitions change.
