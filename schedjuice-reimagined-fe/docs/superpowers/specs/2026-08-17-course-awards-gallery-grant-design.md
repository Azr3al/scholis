# Course Awards — gallery, grant composer, downloads, Studio rail

**Date:** 2026-08-17  
**Status:** Draft (pending review)  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`  
**Surfaces:** `/courses/:id/grading/awards`, Studio context rail on `/studio` and `/award-titles`  
**Supersedes (UI only):** board shape and Add-award overlay in [Course Awards v1](./2026-08-14-course-awards-v1-design.md). Data model, permissions, period, family/duplicate rules, promote, and live grant/delete stay.

## Problem

The Awards grading tab still shows a full roster with name chips and an inline combobox. Teachers need to **see granted certificates** (when a title has a template), **grant several students in one submit**, and **download** images. Award titles in Studio drop **Documents / Award titles** from the context rail.

v1 non-goal “Certificates / PDF” is lifted only as far as **client-composited PNG thumbnails and downloads**. No stored certificate files, no PDF.

## Decisions (locked)

| Question | Decision |
|---|---|
| Gallery card | Certificate thumbnail if the title has a display template; otherwise an info card (name + family). No template → record only, no image |
| Display template | Oldest `AwardTemplate` for that title (`created_at`, then `id`). Grants stay title-only (no `template_id`) |
| Views | Page-level **Gallery \| List**, default Gallery. Not persisted |
| Zero grants | Both views: empty state + **Grant award**. Not an empty roster |
| After grants, Gallery | One card per grant. Students with none this period omitted |
| After grants, List | Only students with ≥1 grant this period. Full roster is not List |
| Grant chrome | In-flow **composer** (`revealBar`). No centered dialog (DESIGN.md §12 / `docs/design/ui-contracts/motion.md`) |
| Entry | Toolbar / empty **Grant award**, or List **Add award** (that student pre-checked) |
| Title first | Catalog typeahead + local create on submit (v1 exact-match rules) |
| Students | Always **checkboxes**, every family. Academic ties = multiple students, same title, one or more submits |
| Academic uniqueness | Unchanged: many recipients per title. Radio UI rejected |
| Batch | One POST; partial success per student |
| Downloads | Client PNG + zip (`jszip`, same as ID cards). Only grants with a display template |
| Studio rail | Pass serializable permission booleans so links remain on `/award-titles` |

## Goals / non-goals

**Goals**

- Gallery (default) and List of **granted** awards for the selected period
- In-flow grant composer: title → students → preview → batch grant
- Certificate thumbnail + preview + PNG download when a display template exists
- Zip of all renderable images for the current period
- Restore Studio rail links on Award titles

**Non-goals**

- `template_id` on `AwardGrant` / primary-template picker
- Persisted gallery/list preference
- Server-rendered or stored certificate files / PDF
- Auto-suggest recipients
- New family uniqueness (ties remain allowed)
- Student-facing awards view
- Today-queue or Academic Performance

## Design-system constraints

From `schedjuice-reimagined-fe/DESIGN.md` and `docs/design/ui-contracts/motion.md`:

- **Prefer inline over dialogs.** Composer slot + `revealBar` + `AnimatePresence`. Title picker is a Combobox/Popover (ephemeral). **AlertDialog** only for a later destructive confirm — v1 delete stays live ×.
- Do **not** use a centered modal for the grant form.
- Buttons **text-led** (§11): Grant award, Add award, Download, Download all, Cancel, Grant.
- No `hover:scale-*` on cards. Period / view switch: `crossfade`. Card mount: `listItemPresence`. `useReducedMotion()` → opacity-only.
- Reserved height for composer errors and preview so async UI does not shift layout.

## Architecture

```
GET  /courses/:id/awards                         roster + picker + display_template on grant titles
GET  /courses/:id/award-titles/:id/display-template   grade-gated; oldest template or null
POST /courses/:id/award-grants/batch             title once, grant per user_id, partial errors

Board (period + Gallery|List + Grant award [+ Download all])
  empty → CTA
  gallery → cards (composite or info)
  list → students with grants + chips + Add award
  composer → revealBar above the body

Studio rail
  canDocuments / canAwards booleans → Documents, Award titles
```

`AwardGrant` / `AwardTitle` / `AwardTemplate` schema unchanged. Single-grant POST, DELETE, promote unchanged. Board GET still returns the **full roster** (composer needs every enrolled student). Gallery/List **filter on the client**.

Thumbnails: existing `bindAwardPreview` + `composite`, lazy for visible gallery cards. Composer preview uses the first checked student, or a placeholder name if none.

## API

### Board GET (extend)

`GET /courses/:id/awards?period_kind=&year=&month=`

Each grant `title` includes:

```
display_template: null | { id, name, document, background_url }
```

Oldest template wins. Picker groups do **not** embed documents. Each picker title includes `has_display_template: boolean` so the composer knows whether to fetch.

Teachers have grade perms, not `award_title.manage`, so they **must not** call `GET /award-titles/:id/templates` (403). Composer preview uses:

`GET /courses/:id/award-titles/:title_id/display-template`

Same grade gate as the board. `200` with the oldest template `{ id, name, document, background_url }`, or `200` with `null` if none / local title. `404` if the title is not usable on this course (retired org, other course’s local).

### Batch grant

`POST /courses/:id/award-grants/batch`

Same grade gate as the board (`assignment.grade` or `grade.manage`).

```
{ title_id?, name?, user_ids: number[], period_kind, year?, month? }
```

Title resolution matches v1 (once per request): `title_id`, else case-insensitive org name, else create local. Then `grant_award` per id (enrollment, duplicate, family, retired).

```
200 { title, granted: [{ id, user, title }], errors: [{ user, message }] }
```

| Case | HTTP | Side effects |
|---|---|---|
| Empty `user_ids` or title cannot resolve | 400 | No grants |
| ≥1 success | 200 | `granted` + `errors` |
| Title resolved, every student fails | 200 | `granted: []` + `errors`; unused new local title deleted (v1 last-grant cleanup) |
| No grade perm | 403 | |
| Wrong tenant / missing course | 404 | |

Family-clash `message` includes the conflicting title name (v1).

## Board UI

Period chips unchanged (course months + Overall; same default).

```
Mark Sheets | Awards
[ Aug 2026 ] … [ Overall ]     [ Gallery | List ]  [ Download all ]  [ Grant award ]
```

**Download all** is omitted on the empty state. On a period with grants, the button is **disabled** when every grant is info-only; enabled when ≥1 grant has `display_template`.

**Empty (both views):** “No awards this period” + **Grant award**. Not a roster of empty students. Copy has no exclamation marks.

**Gallery:** one card per grant, newest first. Template → bound certificate (student, course, title, period). Else info card (name, family if set). Click image → existing full-screen image viewer. × deletes. Local: overflow **Promote to catalog**. **Download** when a template exists.

**List:** one row per student with ≥1 grant. Chips as v1 (truncate, ×, promote). **Add award** keeps v1 hover/touch opacity (in-flow slot, no layout shift). Chip overflow **Download image** when that grant has a template. Students with zero grants omitted.

Gallery has no per-row Add award (use toolbar Grant).

## Grant composer

Opens above gallery/list/empty via `revealBar`. Period = board period. Cancel collapses; no grants.

| Open from | Students |
|---|---|
| **Grant award** | None checked |
| List **Add award** | That student pre-checked |

```
╭─ Grant · Aug 2026 ──────────────────────────────────────────╮
│ Award title  [ combobox: pinned / popular / local / other ] │
│ Students     ☑ …  (full roster, filter if long)             │
│ Preview      thumbnail  or  “This grant is recorded only.”  │
│                              [ Cancel ]  [ Grant ]          │
╰─────────────────────────────────────────────────────────────╯
```

- Exact org/local name binds; unmatched name creates a **local** title **on submit**.
- Already holding this title this period: checked off, disabled (“Already granted”).
- Family clash: checkbox stays enabled; submit may put that student in `errors`.
- Grant disabled until a title (picked or typed) and ≥1 enabled checked student.
- Preview reserved slot: composite for first checked student when a display template exists; otherwise the recorded-only line. Locals have no template in this slice.

## Downloads

Client-only. Reuse `jszip` + `downloadFile` (ID-card zip pattern).

| Action | When | File |
|---|---|---|
| Card **Download** / chip **Download image** | That grant has `display_template` | `{student}_{title}_{period}.png` (sanitized) |
| **Download all** | ≥1 renderable grant this period | `{course}-awards-{period}.zip` of those PNGs |

Info-only grants omitted from the zip. Composite failure on zip → toast, **no file** (no partial archive). Single PNG failure → toast, no file. Busy state on Download all until done or fail.

## Error handling

- Composer validation: reserved error slot, no jump. Empty selection does not call the API.
- Batch 200 with errors: composer stays open; successes uncheck and disable; each failure shows `message` under that student. Toast only if **every** selected student failed.
- 400 on title: error on the title field.
- 403 / 404: toast; composer stays.
- Board GET error: existing “Could not load awards.”
- Promote/delete: unchanged.

## Studio rail

`StudioRecordRailProvider` passes JSON-serializable `pathname`, `canDocuments`, `canAwards` (not `canAny`). `StudioSectionRail` and mobile sections filter with those flags.

| Link | Href | Shown when |
|---|---|---|
| Documents | `/studio` | `document_template.manage` |
| Award titles | `/award-titles` | `award_title.manage` |

Active rules unchanged. Header remains Home + Studio identity. Collapsed School icon rail in record mode is unchanged.

## Tests (high-value)

**BE**

- Grade-perm teacher: batch two students; student 403; no-grade 403
- Empty `user_ids` / unresolvable title → 400, zero rows
- Duplicate + family clash: 200, one granted, one error with conflicting title name
- Two students, same academic-family title, same period → both granted
- Local `name`, all students fail → local title deleted
- Board GET: oldest `display_template` vs `null`
- Grade-perm teacher (no `award_title.manage`): `display-template` 200; catalog `GET /award-titles/:id/templates` still 403
- Wrong tenant 404

**FE**

- Zero grants: empty copy + Grant award in both views; no roster
- After grants: gallery omits empty students; list only students with grants
- Grant award / Add award opens composer (`revealBar`), not `Dialog`
- Title control is Combobox/Popover
- Add award pre-checks that student
- Batch partial: per-student message; successes disable
- Teacher composer preview uses course `display-template`, not catalog templates
- Download hidden without template; Download all omitted when empty, disabled when nothing renderable
- Zip helper omits info-only grants; refuses partial zip (caller-contract, mock composite)
- `/award-titles` with both perms shows Documents + Award titles; awards-only hides Documents

No happy-path-only “renders” tests.

## Follow-ons (later)

- Primary template / `template_id` on grant
- Persist view mode
- Server-side or PDF certificates
- Auto-suggest recipients
- v1 follow-ons still later (Today-queue, Academic Performance)
