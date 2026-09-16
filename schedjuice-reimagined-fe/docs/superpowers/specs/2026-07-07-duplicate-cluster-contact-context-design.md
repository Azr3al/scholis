# Duplicate Cluster Contact Context

**Date:** 2026-07-07  
**Status:** Design approved, pending spec review  
**Scope:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be` (minor API addition)  
**Parent:** [User Insights design](./2026-07-07-user-insights-design.md)

## Problem

The **Potential duplicates** tab on User Insights flags clusters correctly, but admins cannot easily see *why* accounts were grouped. Match badges show labels like "Shared phone" without the shared value. Expanded member rows show name, primary email, and MS sign-in — but not phone, communication email, or emergency contact phone.

This makes triage slow and error-prone. A common false-positive pattern is lazy placeholder data entered during account creation (e.g. phone `0900000`), which links many unrelated students. Admins need to spot these at a glance without opening each user profile.

## Goals / Non-Goals

### Goals

- Show **shared matching values** on cluster match-reason badges.
- Show **Phone**, **Comms email**, and **Emergency phone** columns on expanded member rows.
- **Highlight placeholder/junk** contact values with a warning badge (blocklist + pattern rules).
- Show a **cluster-level false-positive hint** when every match reason in a cluster is placeholder data.
- Small BE change: return `emergency_contact_phone_number` on each cluster member (display value; digits already used for matching).

### Non-Goals

- Do **not** exclude placeholder values from clustering (highlight only; clustering logic unchanged).
- No admin-configurable junk blocklist per school in v1.
- No new tabs, filters, or dismiss/ignore workflow.
- No changes to merge logic or survivor recommendation.
- No backend `is_placeholder` flags on API responses (FE helper is sufficient for v1).

## Decisions Captured (from brainstorming)

| Question | Decision |
|---|---|
| Junk handling | **Highlight known junk** — visual warning, do not change clustering |
| Display location | **Both** — shared values on badges AND contact columns on expanded rows |
| Junk definition | **Blocklist + patterns** — hardcoded common placeholders plus heuristic patterns |
| Emergency phone column | **Yes** — show all three matching fields |
| Implementation approach | **Approach 1 + 3** — FE display helper + cluster false-positive banner; minor BE field addition |

## Approach

### Chosen: Frontend display + junk helper (with minor BE field)

1. Add `isSuspiciousContact(value, field)` helper in FE.
2. Update `duplicate-clusters-table.tsx` to render badge values and a member mini-table.
3. Add `emergency_contact_phone_number` to `load_student_rows` values and member serialization in BE.
4. Unit-test the junk helper and one BE serialization test.

### Rejected alternatives

- **Backend `is_placeholder` flags** — unnecessary API surface when clustering is unchanged.
- **Exclude junk from clustering** — out of scope; admins may still want to see and fix the bad data.

---

## UI Changes

### 1. Match reason badges

**Before:** `Shared phone`  
**After:** `Shared phone · 0900000000`

Rules:

- Append `normalized_value` after the label, separated by ` · `.
- For `communication_email`, display the normalized (lowercased) email.
- For phones, display normalized digits (same value used for matching).
- If `isSuspiciousContact(normalized_value, field)` → use amber outline badge variant and append ` · placeholder` after the value.
- Preserve existing ` · name mismatch` suffix when `possible_sibling` is true.

Example badges:

- `Shared phone · 0900000000 · placeholder`
- `Shared communication email · family@gmail.com`
- `Shared emergency phone · 959123456789 · name mismatch`

### 2. Expanded member rows → mini-table

Replace the current flat flex list with a bordered mini-table inside the expanded cluster row.

| Column | Source field | Notes |
|---|---|---|
| Name | `user.name` | Link to `/users/{id}`; inactive badge inline |
| Primary email | `user.email` | Muted text |
| Phone | `user.phone_number` | `—` if empty |
| Comms email | `user.communication_email` | `—` if empty |
| Emergency phone | `user.emergency_contact_phone_number` | `—` if empty; **new API field** |
| MS sign-in | MS batch lookup | Unchanged formatting via `formatMsLastSignIn` |

Cell styling for suspicious values:

- Amber text color on the value.
- Small `Placeholder` badge (secondary/amber) next to the value.

Parent container keeps `overflow-x-auto` for narrow viewports.

### 3. Cluster-level false-positive banner

When **all** `match_reasons` in a cluster have `isSuspiciousContact(normalized_value, field) === true`:

Render an amber callout above the member mini-table:

> **Likely false positive** — this cluster is linked only by placeholder contact data. Consider correcting the source data rather than merging accounts.

Do not show the banner when the cluster has a mix of real and placeholder links.

---

## Placeholder / Junk Detection

Shared FE helper: `isSuspiciousContact(value: string, field: 'phone' | 'communication_email' | 'emergency_phone'): boolean`

Apply to both raw member field values and `match_reasons[].normalized_value`.

### Blocklist (after normalization)

**Phones** (digits only): `0900000`, `0000000`, `1234567890`, `9999999999`, `1111111111`, `00000000000`

**Emails** (lowercase): `test@test.com`, `n/a@example.com`, `none@example.com`, `noemail@example.com`, `na@example.com`, `xxx@example.com`

Blocklist lives in `schedjuice-reimagined-fe/src/helpers/suspicious-contact.ts` (or alongside `user-insights.ts` if small).

### Pattern rules

**Phone** (after stripping non-digits):

- Fewer than 7 digits.
- All digits are the same character (e.g. `0000000`, `9999999`).

**Email** (lowercase):

- Local part (before `@`) is exactly one of: `test`, `admin`, `noreply`, `none`, `na`, `xxx`, `noemail`, `dummy`.

### Normalization for checks

- Phones: strip non-digits (reuse or mirror `normalize_phone_digits` behavior).
- Emails: `strip().toLowerCase()`.

---

## Backend Changes

### `load_student_rows`

Add `emergency_contact_phone_number` to the `.values()` query in `app_auth/user_insights_services.py`.

### Member serialization in `build_duplicate_clusters`

Add to each member dict:

```python
"emergency_contact_phone_number": by_id[i].get("emergency_contact_phone_number") or "",
```

No change to clustering keys, match-reason shape, or search behavior.

### TypeScript type update

```typescript
export type DuplicateClusterUser = {
  // ...existing fields
  emergency_contact_phone_number: string;
};
```

---

## Files to Touch

| File | Change |
|---|---|
| `schedjuice-reimagined-fe/src/helpers/suspicious-contact.ts` | **New** — `isSuspiciousContact` + blocklist/patterns |
| `schedjuice-reimagined-fe/src/helpers/suspicious-contact.test.ts` | **New** — unit tests |
| `schedjuice-reimagined-fe/src/components/user-insights/duplicate-clusters-table.tsx` | Badge values, mini-table, banner |
| `schedjuice-reimagined-fe/src/types/user-insights.ts` | Add `emergency_contact_phone_number` |
| `schedjuice-reimagined-be/app_auth/user_insights_services.py` | Load + serialize emergency phone display value |
| `schedjuice-reimagined-be/app_auth/tests/test_user_insights.py` | Assert member payload includes emergency phone |

---

## Testing

### Frontend unit tests (`suspicious-contact.test.ts`)

- Blocklist phone `0900000` → true.
- All-same-digit phone `1111111` → true.
- Short phone `12345` → true.
- Valid phone `959123456789` → false.
- Blocklist email `test@test.com` → true.
- Local part `noreply` → true.
- Valid email `family@gmail.com` → false.

### Backend test

- Duplicate search response member includes `emergency_contact_phone_number` when set on user fixture.

### Manual QA

1. Find or create students sharing phone `0900000`.
2. Confirm badge shows value + `placeholder`.
3. Expand cluster — all three contact columns visible; placeholder cells highlighted.
4. Confirm amber false-positive banner appears when all match reasons are junk.
5. Mixed cluster (one real phone link) — per-field warnings only, no banner.

---

## Error Handling

- Empty contact fields render `—`; never run placeholder check on empty strings (returns false).
- Missing `emergency_contact_phone_number` in older cached responses defaults to `""` via `|| ""` on FE.

---

## Future Extensions (not in v1)

- Exclude placeholder values from clustering (backend filter on bucket creation).
- School-configurable blocklist in org settings.
- Backend `is_placeholder` on match reasons for consistency with import wizard warnings.
- Search/filter: "hide likely false positives."
