# Document Template Editor + Certificate Retirement

**Date:** 2026-08-17  
**Status:** Draft (design)  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`  
**Surfaces:** `/documents` (AppShell list); `/templates/document/:id` (full-screen editor); Design app launcher  
**Amends:** [Unified Image Template Editor](./2026-08-14-unified-template-editor-design.md) — drop certificate kind, gallery, and generate. Award + ID-card canvas editors stay. Award titles leave the Setup sidebar.

## Problem

Schools need printable **flow documents** (recommendation letters, report cards, similar letters) with merge fields. The award editor is the wrong medium: it is a camera over a cropped image. Certificates exist as a second image-template product and are being retired.

v1 is **authoring only** — library + editor + draft/publish. Filling a PDF for a student is a later pass. Issued files from that later pass must never change when the template is edited.

## Decisions (locked)

| Question | Decision |
|---|---|
| First job | Printable school documents (letters, report cards). Not email. |
| v1 slice | Org-admin library + editor. No generate/PDF. Teachers see nothing. |
| Template types | One list. No Letter vs Report card discriminator. A grades table is a block anyone can insert. |
| Ownership | Org templates: any `document_template.manage` holder. Private: owner only. Admins may have private templates in v1. |
| Library home | `/documents`. Design launcher tile. **No** sidebar item. |
| Award titles | Remove from Setup sidebar. `/award-titles` + Design launcher tile stay. |
| Certificates | Full retirement. Schema drop. No data copy into document templates. |
| Document model | Block JSON (text, image, two-column layout, grades table, `{{variable}}` chips). |
| Variables | Locked palettes. Unknown keys **400**. Syntax `{{key}}` (same as awards). |
| Versioning | No version history UI. Save → draft. Publish → single published snapshot. Later generate reads published, then stores PDF + frozen JSON. Re-publish never rewrites issued rows. |
| Chrome | Award cream **Back / Save** bar + Resend-like white page and floating insert stack. Interaction is **Google Docs**: scroll the page, type, select. No camera / pan / Fit / zoom. No Code view. |
| Architecture | New `app_documents` / `DocumentTemplate`. Do not hang off org settings. Do not share `TemplateDocument` with awards. |

## Goals / non-goals

**Goals**

- Full-screen block document editor with sample-variable preview
- Org + private templates, duplicate org → mine, promote mine → org
- Draft vs Publish
- Design launcher entry; award titles launcher-only
- Delete the certificate-template product (UI, API, models, permissions)

**Non-goals (v1)**

- Generate / download filled PDFs (one-off or bulk)
- Teacher library, teacher picker, teacher private templates
- Code / HTML source view
- Camera, pan, pinch-zoom, Fit, Docs-style zoom %
- Multi-page pagination
- Autosave
- Myanmar / bilingual faces on this surface
- Copying certificate rows into document templates
- Email send (From / Subject / Resend)
- A shared “templates” app for images and documents

---

## Architecture

```
App launcher · Design
  Award titles  → /award-titles
  Documents     → /documents
  Certificates  → gone

/documents                    AppShell, document_template.manage
  Org templates | My templates
  New (org vs private) · Edit · Duplicate · Promote · Delete
       ↓
/templates/document/:id       no AppShell
  cream Back / name / Draft|Published / Save / Publish
  dark pasteboard · scrollable white page · insert stack
```

Awards and ID cards keep `/templates/award/:id` and `/templates/id-card/:id` (canvas + camera). This editor does not reuse `composite()` or layer HUD.

```
List (AppShell)
  → load DocumentTemplate (org ∪ mine)
  → Edit opens session

Editor
  → in-memory draft document + undo
  → Save PATCH document
  → Publish copies document → published_document
```

Preview interpolates `{{key}}` with a **fixed sample** binder (not a live student). Same binder later generate will use, with real data.

---

## `DocumentTemplate`

Tenant model in new `app_documents`.

| Field | Notes |
|---|---|
| `name` | Required, max 128 |
| `scope` | `org` \| `user` |
| `owner` | FK User. **Null** when `scope=org`. Required when `scope=user` |
| `document` | Draft block JSON |
| `published_document` | JSON, **null** until first Publish |
| `created_by` | User, SET_NULL |

**Uniques / checks**

- Org: unique `lower(name)` among `scope=org`
- Private: unique `(owner, lower(name))` among `scope=user`
- `scope=org` ↔ `owner` is null; `scope=user` ↔ `owner` is set
- `document` (and `published_document` when set) pass `validate_document`

Default name on create: `Untitled`, then `Untitled 2`, `Untitled 3`, … among **that uniqueness set** (org list vs that owner’s private list).

**Status (derived, not stored)**

| Condition | Badge |
|---|---|
| `published_document` is null | Draft |
| `published_document` == `document` (Python dict equality after parse) | Published |
| else | Draft (unpublished changes) |

**Save** writes `document` only. **Publish** sets `published_document = document` after the stricter publish validator. Last-write-wins. No autosave.

**Later generate (contract only, not v1):** read `published_document` (404/400 if null). Write a **new** issued row: PDF bytes + frozen copy of that JSON + bound values. Issued rows have no FK that updates on template Save/Publish. Re-generate is a new issued row.

### Block document (`version: 1`)

```
{
  version: 1,
  page: {
    preset: "a4_portrait" | "a4_landscape" | "letter_portrait" | "custom",
    width: number,
    height: number,
    unit: "mm"
  },
  blocks: Block[]
}
```

Default page: A4 portrait **210 × 297 mm**. A4 landscape **297 × 210**. US Letter portrait **215.9 × 279.4**. Custom W×H in mm, min 1, max **1000** on a side. Matching a named size may snap the preset label. One logical page in v1; overflow **scrolls**. No pagination.

Empty new template: `blocks: []`, A4 portrait, `published_document` null.

Every block: `id` (client uuid), `type`. Unknown `type` → 400.

| `type` | Payload | Notes |
|---|---|---|
| `text` | `text`, font, size, color, align | Inline `{{key}}`. UI shows chips. |
| `image` | `url` (string \| null), width (mm), align | Source asset URL from our upload. Not a generated PDF. |
| `columns` | `columns: [Block[], Block[]]` | Exactly two columns. Children are `text` or `image` only. Nested `columns` or `grades_table` inside a column → 400. |
| `grades_table` | `columns: { key, label }[]` | Top-level only. Keys from the table palette. **No student rows stored.** |

**Forbidden in JSON:** generated PDF/PNG data URLs, unknown variable keys, unknown table column keys, nested columns.

**Fonts:** picker Noto Sans, Fraunces, Adobe Caslon Pro. English-only, same Latin faces as the award canvas. New text defaults to Noto Sans. Stored `Arial` still round-trips if present.

### Palettes

**Inline variables** (extract `{{…}}` from all `text` blocks, including inside columns):

`school_name`, `student_name`, `registration`, `course_name`, `period`, `academic_year`, `current_date`, `mt_name`, `pronoun`

Pronoun: subject form from gender — `MALE` → `he`, `FEMALE` → `she`, otherwise `they`. Preview uses sample gender `FEMALE` → `she`. Current date: now in tenant timezone, `D MMM YYYY`. Other keys: fixed sample copy (e.g. student “Alex Student”, school from tenant name, period “May 2026”, course “Sample course”).

**Table columns:** `subject_name`, `mark`, `letter_grade`, `comment`. Preview: three sample rows. Live bind is generate (later).

### Save vs Publish validation

| Action | Extra rules |
|---|---|
| Save | Shape + known tokens/columns + finite page size. Image `url` may be null. Grades table may be empty columns on draft. |
| Publish | Save rules, plus every `image.url` is a non-empty string, every `grades_table` has ≥1 column. |

---

## Permissions

New catalog code `document_template.manage` (Operational). All document-template methods require it.

Default matrix: **admin** and **manager** (same people who get `award_title.manage`). Superadmin remains god-mode. Teachers/students: 403. Existing tenants: data migration adds the grant to those system roles and **removes** `certificate.view` / `certificate.manage` / `certificate.generate` from catalog and `RolePermission` rows.

Route gates: `/documents` and `/templates/document` → `document_template.manage`.

---

## API

Prefix `/api/v1/`. Wrong tenant / unknown id / **someone else’s private template** → **404** (not 403).

| Method | Path | Notes |
|---|---|---|
| GET | `/document-templates` | Org rows + caller’s private rows only |
| POST | `/document-templates` | `{ name?, scope: "org" \| "user" }` → 201 draft |
| GET | `/document-templates/:id` | Detail including both JSON blobs and derived status |
| PATCH | `/document-templates/:id` | `name` and/or `document` (Save). Does not publish. Same edit rules as GET |
| POST | `/document-templates/:id/publish` | Same editors as PATCH. Publish validator, then copy draft → published |
| POST | `/document-templates/:id/duplicate` | Org → new **private** draft for caller. Copies `document`. `published_document` null |
| POST | `/document-templates/:id/promote` | Private (owner only) → new **org** draft. Copies `document`. `published_document` null. Name clash → 400 |
| DELETE | `/document-templates/:id` | Hard-delete template (+ assets). Issued PDFs (later) stay |
| POST | `/document-templates/:id/assets` | Multipart image upload. Returns `{ url }`. Image blocks store that URL |

Duplicate of a private template is not a v1 action (use New). Promote of an org template → 400.

### Error cases (400 unless noted)

| Case | Behavior |
|---|---|
| No `document_template.manage` | 403 |
| Duplicate name in uniqueness set | 400 |
| Unknown block / token / table column / nested columns or table-in-column | 400 + `details` path |
| `scale`/size non-finite or page side out of range | 400 |
| Publish with empty image URL or empty grades table columns | 400 |
| Publish when already equal | 200, idempotent |
| Output data-URL in JSON | 400 |

---

## Frontend

### Library (`/documents`)

AppShell. Two sections: **Org templates** and **My templates**. Columns: name, status badge, updated. Row actions:

| Action | Who | Result |
|---|---|---|
| New | manage | Dialog: org vs private. Optional name. POST then editor |
| Edit | org: any manage; private: owner | `/templates/document/:id` |
| Duplicate to mine | org rows | POST duplicate, then editor on the copy |
| Promote to org | my rows | POST promote, stay on list (org section shows the new draft) |
| Delete | org: any manage; private: owner | Confirm, DELETE |

No teacher tile. Direct URL without permission: existing route-permission denial.

### Editor (`/templates/document/:id`)

Outside `(internal)` / AppShell, same group as award editors.

```
┌──────────────────────────────────────────────────────────────────┐
│  Back      Documents / {name}     Draft          Save   Publish  │
│  cream identity strip, serif title, accent Save/Publish          │
├──────────────────────────────────────────────────────────────────┤
│  pasteboard (warm dark) — scrolls with the page                  │
│                                                                  │
│   ┌──────────┐      ┌─────────────────────┐                      │
│   │ Text     │      │  Dear {{student_…}} │                      │
│   │ Image    │      │                     │                      │
│   │ Layout   │      │     white page      │                      │
│   │ Table    │      │     A4 frame        │                      │
│   │ Variables│      └─────────────────────┘                      │
│   └──────────┘                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Docs-like interaction (not the award camera)**

- The page is a scrolling document. Caret, typing, selection, drag-to-reorder blocks.
- **No** pan, Space+drag, pinch camera, Fit chip, or zoom %. Overflow is more scroll. Still one logical page.
- Insert stack is text-led: Text, Image, Layout (two columns), Table, Variables. Variables inserts `{{key}}` at caret; disabled when caret is not in a text block.
- Text selection → inline format (font, size, color, align). Image selected → width, align, replace. Table selected → add/remove locked columns. Click page chrome → page preset.
- No layers panel (order = block order). No Edit/Code rail.
- **Back:** dirty confirm → `/documents`. ⌘/Ctrl+S save. Z / Shift+Z undo/redo. Delete removes the selected **block** only when the caret is not in text. Esc deselects.
- Title inline-editable (same commit rules as award editor: empty → `Untitled`).
- Tokens: semantic only (`data-theme="light"` header island, dark pasteboard). No `zinc-*`. English-only.

**Images:** file picker → `POST .../assets` → set block `url`. Empty placeholder until then.

**Data flow**

1. GET template → session draft = `document`
2. Sample binder fills chips and grades-table preview rows
3. Edits mutate draft + local undo
4. Save PATCH `document`. Publish POST. Neither writes a PDF
5. Malformed payload: toast, Back, do not PATCH

---

## Award titles nav

Delete the **Award titles** child from the Setup section in `nav-routes.tsx`. Keep `href: "/award-titles"` in `APP_LAUNCHER_TILES` Design group. Routes and `award_title.manage` unchanged.

---

## Certificate retirement

Retire the **certificate-template product**. Do **not** touch Microsoft/org TLS: `Organization.certificate_id`, private-key `upload_to` paths, Graph “certificate” errors, `sdec-schedjuice-ms-certificate.pem`.

**Remove**

| Layer | What |
|---|---|
| BE | `app_certificates` (models, views, urls, admin, tests, `INSTALLED_APPS`). Schema migration **drops** `CertificateTemplate` and `CertificateTemplateCategory`. Media for those templates is deleted with the rows. No copy into `DocumentTemplate`. |
| API | `certificate-templates`, `certificate-templates/search`, `certificate-templates/:id`, `certificate-template-categories` |
| RBAC | `certificate.view`, `certificate.manage`, `certificate.generate` |
| FE routes | `/certificates`, `/certificates/create`, `/certificates/categories`, `/certificates/documentation`, `/certificates/:id/generate`, `/templates/certificate/:id` |
| FE code | certificate editor, adapter + tests, client-api, store, types, helpers, generate page, thumbnails, Academics nav item, Design launcher tile, route-permissions prefixes |
| Image-template | `kind: "certificate"`, certificate palette, certificate insert-chrome. `TemplateKind` becomes `"award" \| "id_card"` |

**Keep:** award + ID-card editors, `composite()`, ID-card PDF.

Removed certificate URLs: Next 404 / API 404.

---

## Testing

High-value only. No “editor renders” / Save-200 smoke.

**BE — documents**

- Teacher without `document_template.manage` → 403; student → 403
- Duplicate org name → 400; duplicate private name for same owner → 400; two owners may share a private name
- POST draft → 201, `published_document` null
- Unknown token / block type / table column / nested columns → 400 + `details`
- Publish with null image `url` → 400; Save of that draft → 200
- GET/PATCH/DELETE another user’s private id → 404
- Duplicate org → private: owner is caller, published null
- Promote with colliding org name → 400
- Output data-URL in `document` → 400

**BE — certificates gone**

- Catalog has no `certificate.*`
- Old certificate list/detail URLs → 404
- Award-template 403/400/404 tests still pass

**FE**

- Teacher checker: Design groups omit Documents; Setup omits Award titles; Award titles still in launcher for `award_title.manage`
- Unknown `{{token}}` blocked on Save
- Dirty Back confirms; cancel stays
- Duplicate copies draft, published null
- Promote creates unpublished org row
- Insert stack is Text/Image/Layout/Table/Variables — not award Photo/Fields
- No `kind === "certificate"` / certificate adapter imports under `src/`
- Editor has no Fit/zoom camera control

---

## Follow-ons (explicitly later)

- Generate one document for a student (and period for tables) → PDF; freeze JSON + binder on the issued row
- Bulk class/period zip
- Teacher picker: org **published** templates always listed; private only the caller’s
- Docs-style zoom %
- Multi-page flow
- Autosave
- Myanmar / bilingual faces
- Extra variable keys / table columns
- Email send
