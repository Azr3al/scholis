# DVR Details — Preview Form

**Date:** 2026-07-22  
**Status:** Approved (pending implementation plan)  
**Repos:** `schedjuice-reimagined-fe`  
**Approach:** Drop-in `DvrVerifyForm` preview on details (Approach 1)  
**Related:** `2026-07-21-dvr-create-form-designer-layout-design.md` (shared preview form); `2026-07-21-dvr-custom-fields-design.md` (custom field labels — now via preview, not bullet list)

## 1. Summary

On the admin **DVR details** page (`/data-verification-requests/[id]`), replace the “Requested Fields” bullet list with the same disabled **preview form** used on create (`DvrVerifyForm` `mode="preview"`). Metadata (name, audit, expiry, copyable verify link) stays above; preview sits below in the existing vertical stack. No backend changes.

## 2. Goals

1. Show recipients’ form (widgets + required markers) on details, not a text list.
2. Match create preview chrome: `title="Preview"`, `description="This is what recipients will fill in."`, stub user, `data-testid="dvr-preview"`.
3. Keep the current single-column details layout (metadata then preview).
4. Remove details-only label mapping that existed solely for the bullet list.

## 3. Non-goals

- Separate required/optional summary outside the form.
- Two-column create-like layout, field catalog, or settings sheet on details.
- Editing DVR fields/expiry/roles from details (fields remain immutable after create; edit stays delete-only).
- Extracting a shared `DvrPreviewPanel` wrapper.
- Backend, permissions, or API shape changes.
- Changing create or verify pages beyond reuse of existing preview mode.

## 4. Locked decisions

| Topic | Choice |
| --- | --- |
| Field list | Remove “Requested Fields” `<ul>`; preview is the only field view |
| Compact summary | None — required/optional only via preview form UI |
| Layout | Vertical stack under existing metadata (same page shell) |
| Preview chrome | Identical to create (`Preview` + recipients description) |
| Implementation | Inline `DvrVerifyForm` on details page (no new abstraction) |
| Stub user | `DVR_PREVIEW_STUB_USER` from `@/helpers/dvr` |
| Empty fields | Rely on preview empty state (“Select at least one field”); rare after create |
| Custom labels | Handled inside `DvrVerifyForm` via `useFieldDefinitions` — drop page-level `labelByKey` |

## 5. Layout

```
[ ← Back ]                              [ Edit ]

┌─────────────────────────────────────────────┐
│  DVR name                                   │
│  created / updated / by                     │
│                                             │
│  Expires on YYYY-MM-DD                      │
│  DVR Link  [ copyable verify URL ]          │
│                                             │
│  ┌─ Preview ─────────────────────────────┐  │
│  │ This is what recipients will fill in. │  │
│  │                                       │  │
│  │  [ disabled field widgets… ]          │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

Loading and error shells remain as today; a taller skeleton in the preview slot is optional.

## 6. Components & data flow

**Primary file:** `src/app/(internal)/data-verification-requests/[id]/page.tsx`

After the DVR query succeeds, replace the `Field.Root` / bullet list block with:

```tsx
<div data-testid="dvr-preview">
  <DvrVerifyForm
    mode="preview"
    user={DVR_PREVIEW_STUB_USER}
    rawFields={dvrData.fields}
    title="Preview"
    description="This is what recipients will fill in."
  />
</div>
```

**Cleanup on the same page:**

- Remove `useFieldDefinitions`, `labelByKey`, `isDvrBuiltinField`, and unused `Field` / `normalizeDvrFields` imports if no longer needed on the page.
- Keep `BackButton`, `Edit` link, `AuditDisplay`, expiry line, `CopyInput`.

**Unchanged:** `DvrVerifyForm` preview behavior (disabled fieldset, no submit, custom + builtin widgets). Create continues to own its own identical call site.

## 7. Error handling

| Case | Behavior |
| --- | --- |
| DVR load failure | Existing error surface |
| DVR loading | Existing skeletons (optional taller preview placeholder) |
| Empty `fields` | Preview empty copy; no details-specific empty message |
| Inactive / missing custom defs | Existing form behavior inside `DvrVerifyForm` |

## 8. Testing

High-value only (frontend):

1. Details page with a mocked DVR that has fields renders `data-testid="dvr-preview"`.
2. Details page does **not** render the old “Requested Fields” heading/list.

Do **not** re-assert widget rendering, required markers, or stub-user defaults — covered by `dvr-verify-form.test.tsx`. No backend tests.

## 9. Supersedes (details field display)

Relative to earlier DVR upgrade / custom-fields specs that described admin detail as a labeled bullet list of field names + “(required)”:

- Details **field display** is now the shared preview form.
- Label resolution for custom keys on details is no longer a page concern; preview/form path owns it.
