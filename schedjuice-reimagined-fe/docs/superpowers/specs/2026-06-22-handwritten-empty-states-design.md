# Handwritten bilingual empty states — Design Spec

> Standardize empty-state copy as inline mixed English + Burmese in **Schedjuice Hand**, with **rough.js** underlines on one emphasized word per script. Filtered empties keep the same visual treatment and always add a sans recovery action.

**Status:** Approved (brainstorming 2026-06-22)
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — §4 voice, §6.3 handwriting, §8 decoration
**Date:** 2026-06-22

---

## 1. Problem

Empty states across Schedjuice are inconsistent:

| Surface | Today | Issue |
| --- | --- | --- |
| `record-course-list` | Handwriting, English-only | Missing Burmese; no underline |
| `user-hub/empty-state` | Plain sans, bordered card | No handwriting; legacy `ui/button` |
| `academic-hub/empty-state` | Plain sans, bordered card | Same |
| `dashboard-card`, notifications, search | Plain sans one-liners | No bilingual pattern |
| Handwriting showcase | `"Nothing here yet."` demo | English-only; no underline |

`DESIGN.md` already defines Schedjuice Hand for accent moments (including empty states) and `<RoughUnderline />`, but there is no shared primitive tying them together with bilingual copy rules. Authors ship English-only or skip handwriting arbitrarily.

---

## 2. Goals

1. **One visual language** for all empty states — handwriting line + dual highlights + optional sans action.
2. **Bilingual inline mix** on a single line: `English phrase · မြန်မာပိုဒ်` with middle-dot separator (matches existing handwriting showcase).
3. **Key-phrase underlines** — one rough stroke under the emphasized English word and one under the emphasized Burmese word (not the full line).
4. **True empty and filtered empty** share the same visual; filtered states **always** include a sans recovery action (`Clear search`, `Show all`, etc.).
5. **All personas** see the handwriting treatment; copy tone still follows persona voice (no exclamation marks on teacher/admin/principal strings).
6. Slot-based **`EmptyCopy`** primitive (recommended approach) plus a thin dynamic variant for interpolated strings (search queries).

### Non-goals

- Handwriting in combobox/popover dropdown empties (`"No results."` inside a 200px list).
- Inline table/cell empties (`DataTable` `"No results."` row).
- Debug/internal-only pages (`/debug/*`).
- Import wizard and legacy `components/ui/*` surfaces (deferred reskin).
- Sourcing new Burmese hand fonts (continue Sai K2 Handwriting).
- i18n framework / runtime locale switching — strings are authored as fixed EN+MY pairs for now.

---

## 3. Locked decisions (brainstorming)

| Topic | Decision |
| --- | --- |
| Where | **Empty states** — no data, no filter matches, search zero results |
| Script layout | **Inline mix** — one line, ` · ` separator between English and Burmese |
| Underline | **Key phrase per script** — underline one word/syllable on each side |
| Audience | **All personas** |
| True vs filtered | **Same visual**; filtered always adds sans recovery action |
| Implementation | **Slot-based `EmptyCopy`** + dynamic slots for interpolated highlights |
| Handwriting budget | Each empty zone = **one** handwriting moment on that surface (within DESIGN.md 3–5 rule) |
| Actions | Always **sans** — `Button` / accent link; never handwriting |
| Container | **No bordered card** — centered copy in quiet whitespace (`py-10 text-center`) |

---

## 4. Visual pattern

### Layout (lofi)

```
              (quiet whitespace)


    Nothing here yet · ဘာမှ မရှိ သေးပါ
         ~~~~              ~~~~
    (under "here")        (under "မရှိ")

              [ Clear search ]     ← filtered only; sans


              (quiet whitespace)
```

### Tokens

| Element | Classes / tokens |
| --- | --- |
| Line | `font-hand text-hand text-brand` (`--data-green`, decorative handwriting) |
| Separator | Literal ` · ` (space-dot-space) between English and Burmese segments |
| Highlight underline | `<RoughUnderline />` via `HandHighlight` wrapper; `currentColor` = brand |
| Recovery action | `text-sm`, Schedjuice Sans, existing `Button` or `text-accent` link |
| Zone padding | `py-10 text-center space-y-3` on wrapper |

### Underline behavior

- Underlines are **rough.js** strokes, not CSS `text-decoration`.
- Each highlight is an **inline-block** span: text row + `<RoughUnderline />` stacked below (block svg, `w-full` of the highlight span).
- **Do not split Burmese grapheme clusters** — highlights must be whole words or natural syllable chunks (e.g. `မရှိ`, not `မ` + `ရှိ`).
- Seeds are stable per `HandHighlight` instance (reuse `RoughUnderline` seed memo); re-render should not re-wobble.

### Filtered vs true empty

| Kind | Copy | Action |
| --- | --- | --- |
| **True empty** | Static bilingual pair | Optional primary CTA (e.g. Assign courses, Add classes) — sans |
| **Filtered empty** | Bilingual pair; highlight may include user input (quoted search) | **Required** recovery action (clear filter, broaden status, show all) |

---

## 5. Component architecture

Location: `src/components/primitives/empty/` (or `src/components/primitives/copy/` if `empty` feels too narrow).

### `HandHighlight`

Wraps one emphasized fragment and its underline.

```tsx
type HandHighlightProps = {
  children: React.ReactNode;
  className?: string;
};

// Renders:
// <span className="inline-block align-bottom">
//   <span>{children}</span>
//   <RoughUnderline />
// </span>
```

Client component (`RoughUnderline` is client-only).

### `EmptyCopy`

Slot-based bilingual line. All string slots optional except both highlights.

```tsx
type EmptyCopySlots = {
  enBefore?: string;
  enHighlight: string;
  enAfter?: string;
  myBefore?: string;
  myHighlight: string;
  myAfter?: string;
};

type EmptyCopyProps = EmptyCopySlots & {
  className?: string;
};
```

Rendered structure:

```tsx
<p className={cn("font-hand text-hand text-brand", className)}>
  {enBefore}
  <HandHighlight>{enHighlight}</HandHighlight>
  {enAfter}
  {" · "}
  {myBefore}
  <HandHighlight>{myHighlight}</HandHighlight>
  {myAfter}
</p>
```

**Dynamic variant:** same slots; `enHighlight` / `myBefore` may include interpolated user strings (search query). Authors must quote user content in copy (`"{q}"`) and choose highlight boundaries that keep Burmese shaping valid.

### `EmptyState`

Layout shell — no border card.

```tsx
type EmptyStateProps = {
  children: React.ReactNode; // typically <EmptyCopy />
  action?: React.ReactNode;  // sans button(s); required for filtered variants
  className?: string;
};

// <div className={cn("py-10 text-center space-y-3", className)}>
//   {children}
//   {action}
// </div>
```

Domain-specific wrappers (e.g. `UserHubEmptyState`) compose `EmptyState` + `EmptyCopy` + actions rather than re-styling.

### Optional: `empty-copy-catalog.ts`

Static pairs for repeated strings (reviewed EN/MY). Keys map to `EmptyCopySlots`. Dynamic cases stay in JSX. Catalog is **optional** in phase 1 — do not block primitives on it.

Example catalog entries:

| Key | EN highlight | MY highlight | Notes |
| --- | --- | --- | --- |
| `nothing-here` | `here` | `မရှိ` | Generic zone empty |
| `not-enrolled` | `yet` | `မသွင်းရ` | Academic courses true empty |
| `no-users` | `users` | `မရှိ` | User hub true empty |
| `no-match` | `match` | `မတွေ့` | Search/filter base (prepend query in `enBefore`/`myBefore`) |

---

## 6. Copy & voice rules

- **Always ship both scripts** in `EmptyCopy` — no English-only empty states in `.sj-root` surfaces.
- **Persona tone in words, not chrome:** teacher/admin/principal strings stay calm; no `!`. Students may be slightly warmer.
- **User-generated highlights:** wrap queries in quotes; never underline partial user strings that break Burmese clusters.
- **Separator:** always middle dot ` · ` — not em dash (handwriting showcase uses both styles; empty states standardize on dot).
- **Recovery labels:** English-only sans labels are acceptable for buttons (`Clear search`, `Show all courses`) — Burmese button chrome is not required in phase 1.

### Example strings

| Scenario | Line (highlighted words underlined) | Action |
| --- | --- | --- |
| True empty (courses) | Not enrolled **yet** · စာရင်းမသွင်းရ**သေး** | Assign courses |
| Filtered (your classes) | Not in **your** classes · သင်၏ အတန်းများ**မပါ** | Show all courses |
| Filtered (active) | No **active** classes · **တက်ရောက်နေ**သော အတန်းမရှိ | Show all courses |
| Search | No **match** for "foo" · "foo" အတွက် **မတွေ့**ပါ | Clear search |
| User hub | No **users** found · အသုံးပြုသူ **မရှိ**ပါ | — |
| Notifications | Nothing **new** · **အသစ်**ဘာမှမရှိ | — |

---

## 7. Migration scope

### Phase 1 — Primitives + showcase (required)

- Implement `HandHighlight`, `EmptyCopy`, `EmptyState`.
- Add design showcase section under `/components/type/handwriting` or new `/components/empty-states` with true + filtered lofi examples.
- Update handwriting page empty-state demo to full bilingual + underline pattern.

### Phase 2 — Dedicated empty-state components (`.sj-root`)

| Component | Variants to migrate |
| --- | --- |
| `user-hub/empty-state.tsx` | `no-users`, `no-search-results` |
| `academic-hub/empty-state.tsx` | all three variants |
| `record/academic/record-course-list.tsx` | inline empty block (replace partial handwriting) |
| `home/dashboard-card.tsx` | zone empty |
| `app/(internal)/notifications/page.tsx` | inbox empty |
| `app/(internal)/search/page.tsx` | no courses |
| `finances/student-payments-drawer.tsx` | no payments |
| `users/course-history/course-history.tsx` | no history |

Migrate to primitives `Button` where still on legacy `ui/button`.

### Phase 3 — Deferred

- `DataTable` / `unmanaged-data-table` inline empties
- Combobox / command `Empty` rows
- Import wizard, intake steps, CRM grids, debug pages
- `messages/dm-chat.ts` inbox string (needs chat reskin pass)

---

## 8. Accessibility

- `EmptyCopy` paragraph is the accessible name for the empty region; no `aria-hidden` on copy.
- `RoughUnderline` stays `aria-hidden` (decorative).
- Recovery actions are real `<button>` or `<a>` with visible text (not icon-only).
- Handwriting accent is decorative; meaning lives in full phrase, not only highlighted words.

---

## 9. Testing

- **Visual:** showcase page — Burmese-only highlight, mixed line, long search query, narrow viewport (underline reflow via `ResizeObserver`).
- **Unit:** `EmptyCopy` renders slots + separator; optional snapshot of slot assembly (no rough.js pixel tests).
- **Manual:** verify unicode-range routing — Latin highlight in Architects Daughter, Myanmar highlight in Sai K2 on same line.

---

## 10. DESIGN.md follow-up (optional)

Add a short §4 or §6 cross-reference: empty states use `EmptyCopy` pattern; filtered empties require sans recovery action. Not blocking implementation.

---

## 11. Success criteria

1. Shared primitives exist and are documented in the design showcase.
2. Phase 2 surfaces use bilingual inline `EmptyCopy` with dual highlights — no new English-only handwriting empties.
3. Filtered empties in phase 2 always expose a sans recovery action.
4. Empty zones drop bordered-card wrapper where migrated.
