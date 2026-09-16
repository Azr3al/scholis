# Announcement Rich Text & Daily Lesson Copy

> Add MS Teams–compatible rich-text formatting to all announcement composers, and replace “finished/complete” daily-lesson copy with “covered today” framing.

**Status:** Design approved (brainstorming 2026-07-06).
**Related:**
- [2026-07-06-course-feed-teams-sync-design.md](./2026-07-06-course-feed-teams-sync-design.md) — Teams HTML sync for course feed
- [2026-07-06-course-feed-composer-defaults-design.md](./2026-07-06-course-feed-composer-defaults-design.md) — daily lesson default & unit label (copy superseded here)
- [ANNOUNCEMENT_MS_TEAMS_FRONTEND.md](../../../schedjuice-reimagined-be/docs/ANNOUNCEMENT_MS_TEAMS_FRONTEND.md) — org-wide Teams sync

---

## 1. Context

Teachers post course announcements and daily lessons via:

| Surface | Component | Toolbar today |
| --- | --- | --- |
| Course feed composer | `course-feed-composer.tsx` | Hidden (`hideMenu`) — plain text feel |
| Per-course announcement form | `announcement-form.tsx` | Full `EditorMenu` (bottom bar) |
| Org-wide announcement form | `org-wide-announcement-form.tsx` | Full `EditorMenu`; always `send_to_microsoft=true` |

All surfaces use TipTap via `getDefaultEditorOptions()` / `getFeedComposerEditorOptions()`. Extensions already include bold, italic, underline, headings, links, tables, and task lists — but **not** bullet/ordered lists, highlight, or font size. Course feed hides the toolbar entirely.

HTML is stored in `html_data` / `data` and posted to Teams as-is when sync runs (`app_microsoft/announcement_helpers.py`).

Daily lesson posts use `finished_unit` (DB field unchanged) with copy implying completion (“Unit 5 complete”, “Which unit did you finish?”). Teachers want language that reflects **what was covered in class today**, not necessarily finishing a unit.

---

## 2. Goals

1. **Rich-text authoring** on all announcement surfaces: nested bullet/numbered lists, highlight, font size, plus existing inline/block formatting.
2. **MS Teams compatibility** when syncing: toolbar shows only formatting Teams renders reliably.
3. **Course feed UX** — compact sticky formatting bar between body and attachments (always visible).
4. **Copy update** — “covered today” framing everywhere user-visible (composer, feed cards, Teams heading).

## 3. Non-Goals

- Renaming the `finished_unit` database field or API key
- Backend HTML sanitization pipeline (toolbar gating only)
- Rich text in chat, quizzes, or other TipTap surfaces (quiz editor unchanged)
- Burmese translations for new strings (English only in this pass)
- Auto-stripping unsupported marks when toggling Teams on (toast warning only)

---

## 4. Locked Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Scope | All announcement surfaces (course feed + org-wide + legacy per-course forms) |
| 2 | Implementation approach | Extend existing `EditorMenu` + editor config (not a fork) |
| 3 | Teams compatibility | **Teams-safe toolbar** when syncing — hide unsupported controls |
| 4 | Feed composer toolbar | **Compact sticky bar** between body and attachments |
| 5 | Daily lesson copy framing | **Covered/taught** — “Unit N covered today” |
| 6 | Schedjuice-only formatting | Highlight + font size (hidden when `teamsSafe`) |
| 7 | Teams-safe formatting | Bold, italic, underline, headings, links, bullet/ordered lists (nested) |
| 8 | Teams-unsafe formatting | Highlight, font size, tables, task/checkbox lists |
| 9 | Org-wide form | `teamsSafe = true` always (always posts to Teams) |
| 10 | Legacy announcement form | `teamsSafe = false` (no Teams toggle on that form) |
| 11 | Course feed composer | `teamsSafe = postToTeams` (reactive to checkbox) |

---

## 5. TipTap Extensions

### 5.1 New dependencies

Add to `schedjuice-reimagined-fe/package.json` (match existing `@tiptap/*` version `^3.22.3`):

- `@tiptap/extension-highlight`
- `@tiptap/extension-text-style`

### 5.2 New announcement extension set

Create `announcementEditorExtensions` in `src/components/editor/config.ts` (or adjacent module), built from `defaultEditorExtensions` plus:

| Extension | Import | Notes |
| --- | --- | --- |
| `BulletList` | `@tiptap/extension-list` | Nested via `ListItem` |
| `OrderedList` | `@tiptap/extension-list` | Nested via `ListItem` |
| `ListItem` | `@tiptap/extension-list` | Shared with task items |
| `Highlight` | `@tiptap/extension-highlight` | Multicolor off; single yellow mark |
| `TextStyle` | `@tiptap/extension-text-style` | Required for font size |
| `FontSize` | custom mark extending `TextStyle` | Values: `small`, `normal`, `large` → `<span style="font-size: …">` |

**Do not** add math, fill-blank, or quiz image extensions to announcement editors.

### 5.3 Editor option factories

Replace feed-only placeholder wiring with a unified factory:

```ts
type AnnouncementEditorOptions = {
  placeholder?: string;
  teamsSafe: boolean;
};

function getAnnouncementEditorOptions(opts: AnnouncementEditorOptions): UseEditorOptions
```

| `teamsSafe` | Extensions included |
| --- | --- |
| `true` | Document, Paragraph, Text, Bold, Italic, Underline, Link, Heading, BulletList, OrderedList, ListItem, UndoRedo, Placeholder |
| `false` | Above + Highlight, TextStyle, FontSize, TableKit, TaskList, TaskItem |

`getFeedComposerEditorOptions(placeholder, teamsSafe)` becomes a thin wrapper (or is replaced by `getAnnouncementEditorOptions`).

**View mode:** Feed cards and announcement cards continue using read-only TipTap with the full extension set so Schedjuice-only marks render correctly even when Teams cannot display them.

### 5.4 CSS

Add read/edit styles in `src/components/editor/styles.module.scss` (or global TipTap prose):

- `mark` / `.highlight` — brand-tinted background
- `[data-font-size="small"]` / `large` — relative sizes for feed card readability

---

## 6. Toolbar (`EditorMenu`)

Extend `src/components/editor/menu.tsx` props:

```ts
interface EditorMenuProps {
  // existing…
  teamsSafe?: boolean;       // default false
  variant?: "compact" | "full"; // default "full"
}
```

### 6.1 Control matrix

| Control | `teamsSafe=false` | `teamsSafe=true` |
| --- | --- | --- |
| Bold / Italic / Underline | ✅ | ✅ |
| Heading selector | ✅ | ✅ |
| Bullet list | ✅ **new** | ✅ **new** |
| Ordered list | ✅ **new** | ✅ **new** |
| Link (via HoverMenu bubble) | ✅ | ✅ |
| Highlight | ✅ **new** | ❌ hidden |
| Font size (Small / Normal / Large) | ✅ **new** | ❌ hidden |
| Table | ✅ | ❌ hidden |
| Task/checkbox list | ✅ | ❌ hidden |
| Math / fill-blank / quiz image | ❌ (announcement contexts never pass these flags) | ❌ |

### 6.2 Layout variants

**`variant="compact"`** (course feed composer):

- `embedded={true}` styling — muted strip, icon buttons, wraps on narrow widths
- Rendered **between** editor body and attachment uploader (not below footer actions)
- Lo-fi layout:

```
┌──────────────────────────────────────────────┐
│ [title or unit header]                       │
│ [editor body]                                │
├──────────────────────────────────────────────┤
│ B I U  H▾  •  1.  🔗  [🖍 A▾ if !teamsSafe] │
├──────────────────────────────────────────────┤
│ attachments …                                │
└──────────────────────────────────────────────┘
```

**`variant="full"`** (announcement forms):

- Existing bottom sticky bar (`embedded={false}`)
- Same control gating via `teamsSafe`

### 6.3 `TextEditor` integration

Update `src/components/editor/editor.tsx`:

```ts
interface TextEditorProps {
  // existing…
  menuProps?: Pick<EditorMenuProps, "teamsSafe" | "variant">;
  menuPlacement?: "bottom" | "inline"; // inline = between body and next sibling (feed composer)
}
```

Course feed composer: remove `hideMenu`; pass `menuPlacement="inline"`, `variant="compact"`, `teamsSafe={postToTeams}`.

### 6.4 Teams toggle toast

When user checks **Post to Teams** and the document contains highlight, font-size, table, or task-list nodes, show a non-blocking toast:

> Highlight, font size, tables, and checklists won't appear in Teams.

Do not auto-remove content.

When user unchecks Teams, restore full toolbar immediately.

---

## 7. Surface Wiring

| Surface | Editor options | Menu |
| --- | --- | --- |
| `course-feed-composer.tsx` | `getAnnouncementEditorOptions({ placeholder, teamsSafe: postToTeams })` | compact, inline, reactive to checkbox |
| `course-feed-card.tsx` (read) | full extensions, read-only | hidden |
| `announcement-form.tsx` | `teamsSafe: false` | full, bottom |
| `org-wide-announcement-form.tsx` | `teamsSafe: true` | full, bottom |

**Editor re-init:** When `postToTeams` toggles, update editor extensions via `editor.setOptions({ extensions })` (same pattern as placeholder updates) rather than remounting the composer.

---

## 8. Daily Lesson Copy

Centralize display string in `dailyLessonHeader()` (`src/types/course-feed.ts`):

```ts
export function dailyLessonHeader(finishedUnit: number): string {
  return `Unit ${finishedUnit} covered today`;
}
```

### 8.1 String table

| Location | File | New copy |
| --- | --- | --- |
| Field label | `daily-lesson-unit-header.tsx` | **Which unit did you cover today?** |
| Inline suffix | `daily-lesson-unit-header.tsx` | **Unit [n] covered today** |
| `aria-label` | `daily-lesson-unit-header.tsx` | **Unit number covered today** |
| Validation | `course-feed-composer.tsx` (zod) | **Enter the unit number you covered today** |
| Post type menu | `feed-post-type-menu.tsx` | **Log what the class covered today** |
| Feed card header | via `dailyLessonHeader()` | **Unit N covered today** |
| Duplicate dialog | via `dailyLessonHeader()` | **Unit N covered today** |
| Teams heading | `app_microsoft/announcement_helpers.py` `_teams_heading` | `<h2>Unit {n} covered today</h2>` |

No API or model changes. `finished_unit` remains the field name in requests/responses.

---

## 9. Teams HTML Notes

Teams channel messages accept a limited HTML subset. This spec treats the following as **safe** (aligned with Microsoft docs and manual verification):

- `<strong>`, `<em>`, `<u>`, `<a href="…">`
- `<h1>`–`<h3>` (composer headings map to h2–h4 in TipTap; acceptable in Teams)
- `<ul>`, `<ol>`, `<li>` including nested lists
- `<p>`, `<br>`

**Unsafe / hidden when `teamsSafe`:** `<mark>`, inline `font-size` styles, `<table>`, task-list checkbox markup.

Stored HTML in SuConnect is never stripped; only the authoring toolbar is gated.

---

## 10. Testing

### 10.1 Frontend (Vitest)

| Test | File |
| --- | --- |
| `dailyLessonHeader(7)` → `"Unit 7 covered today"` | `src/types/course-feed.test.ts` (update existing) |
| Optional: `teamsSafe` hides highlight button | `src/components/editor/menu.test.tsx` (new, if feasible with TipTap mock) |

### 10.2 Backend (Django)

Update `app_microsoft/tests/test_course_feed_teams_sync.py`:

```python
self.assertIn("<h2>Unit 5 covered today</h2>", html)
```

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_course_feed_teams_sync
```

### 10.3 Manual checklist

1. Course feed — Teams **off**: compose nested lists, highlight, font size → post → feed card renders all formatting.
2. Course feed — Teams **on**: toolbar hides highlight/size/table/checklist; nested list + bold → post → Teams channel matches.
3. Toggle Teams on with highlight in body → toast appears; post → Teams lacks highlight, feed retains it.
4. Org-wide form: toolbar matches Teams-safe set; post reaches Teams with lists/bold.
5. Daily lesson: composer label reads “covered today”; card header matches; Teams heading matches.

---

## 11. Files Touched (implementation preview)

**Frontend (`schedjuice-reimagined-fe`):**

- `package.json` — new TipTap packages
- `src/components/editor/config.ts` — announcement extensions + options factory
- `src/components/editor/menu.tsx` — list/highlight/font-size controls + `teamsSafe` / `variant`
- `src/components/editor/editor.tsx` — menu placement props
- `src/components/editor/styles.module.scss` — highlight + font-size styles
- `src/components/course/feed/course-feed-composer.tsx` — show toolbar, wire `teamsSafe`, toast
- `src/components/course/feed/daily-lesson-unit-header.tsx` — copy
- `src/components/course/feed/feed-post-type-menu.tsx` — copy
- `src/types/course-feed.ts` + `.test.ts` — header helper + test
- `src/components/announcement/announcement-form.tsx` — `teamsSafe={false}`
- `src/components/announcement/org-wide-announcement-form.tsx` — `teamsSafe={true}`

**Backend (`schedjuice-reimagined-be`):**

- `app_microsoft/announcement_helpers.py` — `_teams_heading` copy
- `app_microsoft/tests/test_course_feed_teams_sync.py` — assertion update

---

## 12. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| TipTap extension churn when toggling `teamsSafe` | Use stable extension arrays; test toggle in manual checklist |
| Nested lists render differently in Teams | Teams-safe gating still allows lists; manual verify nested case |
| Legacy posts say “complete” | Acceptable — copy change is forward-only; no migration |
| Org-wide authors lose highlight/font size | By design — org-wide always syncs to Teams |
