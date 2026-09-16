# Award title — single certificate per title

**Date:** 2026-09-13  
**Status:** Approved (design)  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`  
**Surfaces:** `/award-titles`, `/award-titles/:id/edit`, `/award-titles/:id/certificate`, course awards gallery/grant  
**Supersedes:** multi-template list UX and “oldest template wins” display rule in [Course Awards gallery/grant](./2026-08-17-course-awards-gallery-grant-design.md)

## Problem

Org award titles can have **multiple** `AwardTemplate` rows. The edit page lists them with a **New** button, but grants and gallery thumbnails only ever use **one** template — today the **oldest** by `(created_at, id)`. That mismatch confuses admins (they create alternates that never appear) and leaves dead API surface (`GET/POST …/templates`, `award-templates/:id`).

Teachers and gallery code only need “does this title have a certificate design?” — not a template catalog.

## Decisions (locked)

| Question | Decision |
|---|---|
| Cardinality | **At most one** certificate per org `AwardTitle` |
| Model shape | Keep **`AwardTemplate` as its own table** (do not merge `document`/`background` onto `AwardTitle`) for future expansion |
| Relationship | `AwardTitle` ↔ `AwardTemplate` becomes **OneToOne** (`related_name="template"`) |
| Existing duplicates | Migration keeps the **newest** row per title (`updated_at` desc, then `id` desc); delete the rest |
| Local titles | Still **no** certificate (`course` set → validation error) |
| Edit UX | Award title **metadata** stays on `/award-titles/:id/edit`; certificate canvas is **first-class** on `/award-titles/:id/certificate` |
| Certificate section on edit page | **Create certificate** when none; **Edit certificate** when one exists. No list, no per-row delete |
| Editor title field | **Read-only** in certificate editor (name edited on edit page only) |
| Display template rule | The single linked template (no sort/pick) |
| Template `name` column | Kept in DB; set to `title.name` on create; not user-editable in v1 |
| Removed routes | `GET/POST /award-titles/:id/templates`, `GET/PATCH/DELETE /award-templates/:id`, `/templates/award/:templateId` |

## Goals / non-goals

**Goals**

- Enforce one certificate per org award title at DB + API level
- Title-scoped certificate CRUD (`/award-titles/:id/certificate`)
- First-class certificate editor route keyed by **title id**
- Simplify `serialize_display_template` and picker `has_display_template` (no multi-template queries)
- Data migration for tenants with duplicate templates

**Non-goals**

- Merging template columns into `AwardTitle`
- `template_id` on `AwardGrant`
- Multiple certificate variants (locale, season, etc.) — future work can extend `AwardTemplate` or add related models
- Explicit **Delete certificate** on edit page (clearing happens only if we add it inside the editor later)
- PDF / server-rendered certificates
- Changes to grant period, family, promote, or board shape

## Architecture

```
/award-titles/:id/edit
  metadata (name, family, pinned, retire)
  Certificate section
    none → POST /award-titles/:id/certificate → redirect to editor
    one  → link → /award-titles/:id/certificate

/award-titles/:id/certificate
  full-screen AwardEditor (loads PATCHes title-scoped certificate)
  back → /award-titles/:id/edit

Course /grading/awards
  display_template from title.template (grade-gated fetch unchanged)
```

`AwardGrant` unchanged. Grants remain title-only.

---

## Data model

### `AwardTemplate` (modify)

| Change | Detail |
|---|---|
| `title` | `ForeignKey` → **`OneToOneField(AwardTitle, related_name="template", on_delete=CASCADE)`** |
| Constraints | Drop `uniq_award_template_title_name`; add **`uniq_award_template_title`** on `title_id` |
| `name` | Retained; internal mirror of title name at create time |

### Invariants

- Org title (`course=null`): **0 or 1** `AwardTemplate`
- Local title (`course` set): **0** templates (check unchanged)
- Retiring a title does not delete its certificate row

### Data migration

For each `AwardTitle` with `templates.count() > 1`:

1. Select keeper: `ORDER BY updated_at DESC, id DESC LIMIT 1`
2. `DELETE` other `AwardTemplate` rows for that title (CASCADE/storage cleanup as today on model delete)
3. Apply schema migration (FK → OneToOne + unique on `title_id`)

Empty-document templates are valid keepers if they are the newest row.

---

## API

### New: title-scoped certificate

All require `award_title.manage`.

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/award-titles/:id/certificate` | — | `200` template payload or `404` if org title has no certificate |
| `POST` | `/award-titles/:id/certificate` | optional `{ name }` ignored in v1 | `201` empty document template; **`409`** if certificate already exists |
| `PATCH` | `/award-titles/:id/certificate` | `{ document?, background? }` multipart when background file | `200` updated template; same validation as today (`validate_award_document`, background required when document saved) |
| `DELETE` | `/award-titles/:id/certificate` | — | `204`; title row remains |

**Local title:** `400` with `{ title: "Local titles cannot have templates." }` (same message as today).

**Payload shape** (unchanged from current `AwardTemplateSerializer`):

```json
{
  "id": 1,
  "title": 42,
  "name": "Top 1",
  "document": { … },
  "background_url": "https://…"
}
```

### Removed

- `GET/POST /award-titles/:id/templates`
- `GET/PATCH/DELETE /award-templates/:id`

### Unchanged (implementation only)

- `GET /courses/:courseId/award-titles/:titleId/display-template` — grade-gated; returns same payload or `null`; reads `title.template` instead of sorting
- Board GET `display_template` on grant titles — same JSON shape
- Picker `has_display_template: boolean` — `EXISTS` on one-to-one

### Services

- Remove `create_award_template` multi-name logic / duplicate-name check per title
- Replace `serialize_display_template(title)`:

```python
template = getattr(title, "template", None)  # or title.template with select_related
if template is None:
    return None
return AwardTemplateSerializer(template, context=…).data  # same display subset as today
```

- Picker `with_tmpl`: `AwardTemplate.objects.filter(title_id__in=ids).values_list("title_id", flat=True)` still works (now 0–1 per id)

---

## Frontend

### Edit page (`/award-titles/[id]/edit`)

Replace `AwardTitleTemplates` list with **Certificate** section:

| State | UI |
|---|---|
| Loading | Skeleton |
| No certificate | Copy: “No certificate yet.” + **Create certificate** button |
| Has certificate | **Edit certificate** link → `/award-titles/[id]/certificate` |

Remove: template list, **New**, per-template **Delete**, navigation to `/templates/award/:templateId`.

### Certificate editor (`/award-titles/[id]/certificate`)

- New route under `(internal)` or `(template-editor)` layout (match existing editor chrome)
- `AwardEditor` refactored to accept **title id**:
  - `GET/PATCH /award-titles/:id/certificate`
  - On first load with no certificate: optional redirect to edit page (editor route assumes POST already ran from edit page)
- `EditorShell`: show award **name** read-only (from `getAwardTitle`); remove editable template name field
- `backHref` / home → `/award-titles/[id]/edit`
- Save toast: “Certificate saved.”

### Routes & permissions

- Add `{ prefix: "/award-titles", … }` already covers `/award-titles/:id/certificate` via prefix match
- Remove `/templates/award` route rule or add redirect to title-scoped URL if old links exist
- Delete `src/app/(template-editor)/templates/award/[templateId]/page.tsx` after redirect or replace with redirect helper

### API client (`awards-api.ts`)

Replace:

- `listAwardTemplates`, `createAwardTemplate`, `getAwardTemplate`, `updateAwardTemplate`, `deleteAwardTemplate`

With:

- `getAwardCertificate(titleId)`
- `createAwardCertificate(titleId)`
- `updateAwardCertificate(titleId, { document?, background? })`
- `deleteAwardCertificate(titleId)` — implement for API parity; no edit-page button in v1

Types: keep `AwardTemplate` shape for certificate payloads; optional rename to `AwardCertificate` in TS for clarity (either is fine).

### Grants / gallery

No UI changes required. `display_template` and `has_display_template` behavior unchanged from teacher perspective; only backend selection rule changes from “oldest” to “the one”.

---

## Error handling

| Case | Behavior |
|---|---|
| POST certificate when one exists | `409` `{ certificate: "This title already has a certificate." }` |
| PATCH/GET certificate when none | `404` |
| Certificate on local title | `400` validation error |
| Malformed document in editor | Same as today — block save, toast |
| Save without background when document has layers | Same as today — `400` background required |

---

## Testing

### Backend (high-value)

- Migration: title with 3 templates → 1 remains, newest `updated_at`
- OneToOne: second insert for same title → `IntegrityError` / API `409`
- POST twice → second `409`
- Local title certificate endpoints → `400`
- `serialize_display_template` returns template when present, `None` when absent
- Board grant includes `display_template` when certificate exists
- Teacher: `display-template` OK; `GET /award-titles/:id/certificate` forbidden without `award_title.manage`
- Remove/update tests that assert **oldest** wins

### Frontend

- Edit page: shows Create vs Edit certificate CTA
- Editor loads by title id; save calls PATCH certificate endpoint
- Editor does not expose editable template name
- Route permission test for `/award-titles/1/certificate`

---

## Rollout

Single deploy: migration + API removal + FE route change. No feature flag.

**Old URL:** Delete `/templates/award/[templateId]` in the same PR (all in-app links move to `/award-titles/:id/certificate`). Admin-only; no redirect shim.

---

## Spec references

- [Course Awards v1](./2026-08-14-course-awards-v1-design.md) — `AwardTitle` / grants
- [Course Awards gallery/grant](./2026-08-17-course-awards-gallery-grant-design.md) — `display_template` on board (display rule superseded here)
