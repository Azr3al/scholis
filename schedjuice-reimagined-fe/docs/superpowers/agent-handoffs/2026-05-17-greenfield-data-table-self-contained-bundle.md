# Schedjuice v2 — Self-contained agent bundle (greenfield data-table)

**How to use this file.** Save a copy into your new greenfield repo (e.g. `docs/AGENT_HANDOFF_DATA_TABLE.md` at the repo root). Paste the first section into the **first message** of the new AI agent session, or attach this entire file. The agent **does not** rely on paths in the legacy `schedjuice-reimagined-fe` repo — everything below is inlined.

**Errata (read before implementing §12 of the data-table brief):** the code sample that imports `useResourceTableState` from `@/components/data-table/advanced` is stale. Use `useAdvancedResourceTableState` from that path instead, as described in the prose immediately after the sample.

**Package manager:** replace `pnpm` in the Definition of done with the repo’s actual tool if different.

---

# PART A — Agent kickoff (paste this message first)

You are building the Schedjuice v2 frontend from a clean slate in **this** repository.

## Single source of truth for this assignment

Everything you need is **below PART B–E in this same document** (Design System Brief, API SDK Brief, Data Table Brief). Do not ask for files from any other repository.

## Read order

1. **PART B** — Design System Brief (tokens, typography, Base UI, paper aesthetic, banned list).
2. **PART C** — API SDK Brief (typed SDK boundary, `ListResult<T>`, hooks, `ApiError`, RSC hydration).
3. **PART D** — Data Table Brief (this assignment).

## Your assignment

Implement the **Data Table foundation** exactly as specified in PART D. No application list pages (real courses/invoices pages) until PART D §14 is delivered and reviewed.

## Blockers

- If **PART C** (SDK) is not implemented in this repo yet, **stop** and report that dependency. `<ResourceTable />` requires real `listHook` + `ListQuery<T>` + `ListResult<T>` from `src/sdk/`.
- For **showcase pages** under `/_design/data-table/*`, use **static fixtures and mocked list-hooks** — no running backend required (see PART D §14.2).

## Workflow (superpowers)

1. `brainstorming` — only if PART D is genuinely ambiguous; do not re-litigate settled decisions.
2. `writing-plans` — produce `docs/superpowers/plans/<YYYY-MM-DD>-data-table-foundation-plan.md` (or equivalent in this repo).
3. Get plan reviewed.
4. `executing-plans` — implement with checkpoints.
5. `verification-before-completion` — no “done” without evidence (tests, screenshots).

## Anti-patterns to refuse

- Do not grow `<ResourceTable />` with boolean feature props (`isXEnabled`). PART D §15 item 1. Compose at page level, use `<AdvancedResourceTable />`, or ask a human.

---

## Definition of done

You are done with the data-table foundation when **all** of the following hold. Capture evidence (test output, screenshots) for each.

1. **File tree** from PART D §4 is fully implemented under `src/components/data-table/`.
2. **Types:** `<Table />`, `<ResourceTable />`, `<AdvancedResourceTable />`, `<ResourceCardList />` have no `any` and no `// @ts-ignore` / `// @ts-expect-error` in table code. `pnpm typecheck` (or repo equivalent) passes.
3. **Tests:** `pnpm test` passes with coverage for: `useResourceTableState` and `useAdvancedResourceTableState` (URL + local + namespace collision in dev + reset + defaults); every `column.*` helper; `<ResourceTable />` integration (sort cycle, debounced search, filter chips, pagination, empty/loading/error); `<AdvancedResourceTable />` (reorder + multi-sort); `<ResourceCardList />`; keyboard a11y on headers and interactive cells.
4. **Showcase routes** mount without runtime errors:
   - `/_design/data-table/basic`
   - `/_design/data-table/full-toolbar`
   - `/_design/data-table/advanced`
   - `/_design/data-table/card-list`
   - `/_design/data-table/bilingual`
5. **Bilingual stress page** shows Burmese in cells, mixed-script titles, Burmese headers without broken shaping, a Burmese filter chip label, and a Burmese handwriting empty message — no layout collapse or font fallback breakage. **Screenshot proof.**
6. **Litmus test:** side-by-side screenshot of `/_design/data-table/full-toolbar` vs a vanilla shadcn admin table — Schedjuice must be **obviously** not generic SaaS. Attach both.
7. **`<ResourceTable />` public API** matches PART D §5.2: only required config (`listHook`, `query`, `columns`, `tableState`) + slots (`toolbar`, `rowActions`, `emptyState`, `loadingState`, `errorState`, `onReady`) + `pageSize`. No feature-toggle booleans.
8. **`src/components/data-table/README.md`** contains every recipe from PART D §14.4 with runnable snippets pointing at the showcase pages.
9. **README dogfood:** you (the agent) follow “How to wire a basic list page” for a resource **you did not build** (e.g. `students`) and confirm \< 15 minutes wall-clock **or** document the gap and fix the README.
10. **Handoff note:** list anything explicitly deferred (column resize, virtualization, skeleton rows) with one-line rationale each.

If any check fails, **do not** claim completion.

---

# PART B — Schedjuice v2 Design System Brief (full text)

# Schedjuice v2 — Design System Brief

> **Audience:** the AI agent scaffolding the new Schedjuice frontend from scratch.
> **Mode:** design-first. No feature code until the foundation in this brief is in place and reviewed.
> **Greenfield rule:** do **not** import code, tokens, components, or class-name patterns from the legacy `schedjuice-reimagined-fe` repo. The existing `docs/AGENT_UI_SYSTEM.md` describes the aesthetic we are **rejecting**, not extending. Read it only to know what to avoid.

---

## 1. What you're building

Schedjuice is a **school operations platform for the Myanmar education market**. One product, multi-tenant: each school is its own Postgres schema on the backend. The platform serves four distinct personas (students, teachers, admins, principals) and ships both a web app (this rebuild) and a mobile companion (Expo push notifications, real-time chat).

The functional surface is wide. The agent should design tokens and primitives knowing they will eventually have to render all of this without fracturing:

| Domain | What it does (one line) |
|---|---|
| Courses | The spine. Sessions, rosters, materials, attendance, course-specific rates, chat. |
| Quizzes (v3) | Authoring, attempts, auto-grading, rich content (math, images). |
| Attendance | Per-session check-in for students and staff. |
| Finance | Invoicing, payment plans, payment verification, multi-currency (`djmoney`). |
| HR | Staff records, contracts, reports. |
| Library | Materials, attachments, downloads. |
| Chat | Real-time, WebSocket-backed, per-course threads and DMs. |
| Announcements | Org-wide and per-cohort broadcasts, MS Teams integration. |
| Tasks | Per-user todo / workflow items. |
| Wiki | Internal docs. |
| Certificates | Generated PDFs with names, signatures. |
| Reports | HR, finance, attendance reporting surfaces. |
| Attachments | File upload (chunked), preview, image editing. |
| Organization / Departments / Campuses | Tenant structure, custom fields per tenant. |
| Calendar | Sessions, events — must render the **Myanmar calendar** alongside Gregorian. |
| Integrations | Microsoft (MSAL auth, Teams, Outlook), Zoom (meeting links + recordings). |

You do not build features in this phase. But every token decision must survive contact with a finance table and a chat thread and a bilingual certificate, not just a marketing page.

**Bilingual is first-class.** Burmese script appears anywhere user-generated content lives — student names, course titles, announcements, chat messages, certificate names. The type system must route Burmese characters to a Myanmar-specific face automatically; English and Burmese will sit next to each other in the same line constantly.

---

## 2. Anti-positioning — why this design exists

Every edtech SaaS in Myanmar (and most globally) looks the same right now: vanilla shadcn-on-Tailwind, near-monochrome neutrals, rounded-2xl cards in 3-up grids, Lucide icons everywhere, a sidebar with a logo and three nav groups. A screenshot of any one of them is indistinguishable from the next.

**Schedjuice's classroom personality is the moat.** Not the feature set — competitors will copy features. The thing they cannot cheaply copy is a coherent, opinionated, warm, lived-in design language that feels like the product was made by people who have actually been inside a classroom.

The litmus test: **if a screenshot of your output could be placed next to a generic shadcn dashboard and the user couldn't tell which one was Schedjuice, you have failed the brief.** The design is the differentiation.

This is also why **shadcn UI is banned outright** — see §11. It is not a tooling preference. Importing shadcn (vanilla or themed) collapses Schedjuice into the same visual category as everyone else.

---

## 3. Brand voice & positioning

Schedjuice should feel like walking into a well-loved classroom: warm, paper-textured, lived-in, with traces of human hand and craft. Non-techy voice. Confident but never corporate. Playful in concentrated moments, quiet everywhere else.

### North-star references (priority order)

- **Anthropic** — restraint, warm off-whites, paper feel, deliberate typography
- **Granola** — quiet craft, paper texture, type-led
- **Khan Academy (newer surfaces)** — friendly without childish
- **Are.na** — intellectual, paper-like, anti-trendy
- **Readwise / Reader** — warm, restrained, paper feel
- **Notion** — emoji-as-personality used sparingly

### Explicitly NOT references

Vanilla shadcn, Linear (too corporate-clean for this brief), Tailwind UI Kit, most fintech aesthetics, generic admin templates, anything that ships a "premium dashboard" Figma file.

---

## 4. Color system

Anchor on a warm cream-dominated palette. Greens persist from the existing brand, used as **accent not background**. One warm earth tone for personality. No gradients between brand colors. Solid blocks only.

| Token | Hex | Role |
|---|---|---|
| `--pixel-white` | `#FCF4E3` | Dominant surface (~70% of any view) |
| `--terminal` | `#102C24` | Primary text, dark surfaces, rare full-bleed moments |
| `--circuit-board` | `#2E4E49` | Secondary text, hover states |
| `--data-green` | `#60A17E` | Brand accent — used **sparingly**, one Data Green moment per surface max |
| `--terracotta` | `#C97B5F` | **Locked** warm accent — earthy, classroom-coded, single warm personality color |
| Warm grayscale ramp | derived | Slight brown undertone. **No cool grays anywhere.** |

The accent question is **closed**: Terracotta wins. Do not introduce Ochre, mustard, or any second warm accent. One accent is the discipline.

Define semantic aliases for application use (`--surface`, `--surface-elevated`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--accent-foreground`, `--danger`, `--success`, `--warning`, `--border`, `--ring`). Components consume the aliases; only the theme layer consumes raw color tokens.

---

## 5. Typography

Four families, each with a defined role. Body is bilingual by construction.

### 5.1 Bilingual body — Noto Sans + Noto Sans Myanmar

Body text uses a **two-family stack with `unicode-range` routing** so Burmese characters always render in Noto Sans Myanmar and Latin characters in Noto Sans. This is non-negotiable: Burmese fallback to system fonts looks broken on every browser.

```css
/* Latin face — unrestricted; catches everything that isn't Burmese */
@font-face {
  font-family: "Schedjuice Sans";
  src: url("/fonts/NotoSans-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}

/* Burmese face — restricted to Myanmar Unicode blocks so it takes precedence
   for Burmese codepoints, falls through to the Latin face for everything else */
@font-face {
  font-family: "Schedjuice Sans";
  src: url("/fonts/NotoSansMyanmar-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  unicode-range: U+1000-109F, U+AA60-AA7F, U+A9E0-A9FF;
  font-display: swap;
}
```

Then `font-family: "Schedjuice Sans", system-ui, sans-serif;` is the single body token. The agent never thinks about which face to apply — the browser routes by codepoint. Apply the same two-face pattern (`Schedjuice Hand`) to the handwriting accent: Caveat for Latin, Padauk constrained to the Burmese unicode ranges.

- **Minimum body size:** 16px. Burmese reads heavier at small sizes; do not go below.
- **Line-height for body:** 1.6 (Burmese ascenders need vertical room).
- **No `text-transform: uppercase` on Burmese characters** — it does nothing useful and frequently breaks shaping. Where uppercase is part of the style (small caps for table headers), guard against bilingual strings or skip the transform.

### 5.2 Headers — Fraunces (warm serif)

Used for h1/h2, hero text, section titles. Set with `text-balance` for headlines and tight tracking on large sizes. If a header contains Burmese characters, the Burmese portion falls through to Noto Sans Myanmar (or Padauk, see below) — that's intended, no styling needed.

### 5.3 Handwriting accent — Caveat + Padauk (Burmese placeholder)

For 3–5 designated moments per surface only: section taglines, encouraging callouts, signature moments. **Never** for body text, nav, headers in production UI, table cells, or anything inside form controls.

- **Latin handwriting:** Caveat (Google Fonts, variable). Confident, expressive, not cartoony.
- **Burmese handwriting (placeholder):** Padauk (Google Fonts). Padauk is not a true handwriting face — it is the friendliest free Burmese face on Google Fonts and serves as a placeholder until a proper Burmese handwriting font is sourced. Document this as a known follow-up.

Set up the handwriting accent as `font-family: "Schedjuice Hand", cursive;` with the same `unicode-range` routing pattern as body.

### 5.4 Monospace — IBM Plex Mono

For codes, IDs, tabular numbers, quiz answer keys, audit timestamps, anywhere alignment matters or text represents data-as-text. Humanist warmth, free, ships from Google Fonts. **Not for code-as-decoration** — the brief is paper, not terminal.

### 5.5 Type scale

Lock the scale on day one. Don't drift. Define as CSS custom properties so primitives consume by name, not by px.

| Token | Size | Line-height | Family | Use |
|---|---|---|---|---|
| `--text-xs` | 12px | 1.5 | Sans | metadata, captions |
| `--text-sm` | 14px | 1.55 | Sans | secondary UI, small labels |
| `--text-base` | 16px | 1.6 | Sans | body |
| `--text-lg` | 18px | 1.55 | Sans | emphasized body |
| `--text-xl` | 20px | 1.45 | Sans | sub-section titles |
| `--text-2xl` | 24px | 1.35 | Serif | section titles |
| `--text-3xl` | 32px | 1.25 | Serif | page titles |
| `--text-4xl` | 44px | 1.15 | Serif | hero |
| `--text-hand` | varies | 1.4 | Hand | callout accent |
| `--text-mono` | 14px / 16px | 1.55 | Mono | codes, tabular numbers |

---

## 6. Persona × language register

Microcopy register is per-persona and bilingual-aware. The agent does not write product copy in this phase, but the **showcase pages must include bilingual sample strings** so the typography stack is verified in both scripts.

| Persona | Tone | Typical language | Examples |
|---|---|---|---|
| **Students** | Warm, playful, light. Exclamation marks OK. | Mixed EN/MY, sometimes MY-dominant | "No classes for you today. Yay!" / "ဒီနေ့ နားရက်ပါ။" |
| **Teachers** | Respectful, time-aware, calm. **No exclamation marks** — teachers are tired. | EN-dominant, MY for student-facing surfaces | "You're free this afternoon. Take a breath." |
| **Admins** | Neutral, efficient, no decoration. Speed-optimized. | EN | "12 unverified payments. Open queue." |
| **Principals** | Clear, summary-first, slightly formal. | EN | "This week's attendance is down 4% versus last." |

Write a one-page voice guide before any UI strings ship.

---

## 7. Bilingual & script-mixing rules

Schedjuice will render strings like `"အောင်ဇေယျ submitted Quiz 4"` constantly. The design system must handle this without thinking.

- **Same line, mixed scripts:** never break a line between Burmese and Latin. The unicode-range routing handles font selection automatically.
- **Vertical rhythm:** Burmese characters have taller ascenders. Body line-height of 1.6 accommodates both; do not tighten below 1.5 for any text that may contain Burmese.
- **No uppercase transforms on Burmese.** Where a style calls for small caps (e.g., table headers), either restrict to Latin-only content or skip the transform when Burmese is detected. Prefer the latter — design the header style to work without uppercase.
- **Numbers:** tabular numbers from Plex Mono for finance / attendance / counts. Myanmar digits (၀၁၂၃၄၅၆၇၈၉) appear in some content — they should render in Noto Sans Myanmar automatically; do not force Latin digits.
- **Test strings:** the showcase pages must include at least one Burmese-only paragraph, one mixed paragraph, one Burmese name in a button, one Burmese name in a table cell, and a Burmese quote in handwriting style. If any of these look wrong, the system is broken.

---

## 8. Texture & decoration

- **Paper grain:** subtle SVG noise overlay (5–8% opacity) on full-bleed cream surfaces. Inline SVG, not raster. One shared `<PaperGrain />` component, applied at the layout root and a few hero surfaces.
- **Hand-drawn marks:** underlines, frames, dividers, callout boxes generated with **rough.js** — procedural, slight wobble, organic stroke ends. Provide helpers: `<RoughUnderline />`, `<RoughFrame />`, `<RoughDivider />`, `<RoughCallout />`. Cache seeds so the same element doesn't re-wobble on every render.
- **No hard 1px borders** where a rough.js line could carry the same meaning — section dividers, callout boundaries, table separators all benefit from organic strokes.
- **No gradients between brand colors.** Solid blocks only. The only allowed gradient is paper-grain noise.

---

## 9. Layout principles

- **Asymmetric, type-led, generous whitespace.** Resist the SaaS reflex to fill every pixel.
- **No card-stacking.** No "12 widgets in rounded rectangles" dashboards. Most surfaces should have **one** dominant element, **one** supporting element, **one** quiet element — three-zone composition.
- **Forms are composed deliberately**, not abstracted. Each form layout makes vertical-rhythm and grouping choices specific to the form. There is no `<AutoForm>`, no shared "stack of inputs" wrapper, no schema-driven form renderer in the foundation phase.
- **Tables are typography-first.** Column headers in small caps (Latin only — see §7), no icon decoration on headers, generous row height (52px minimum), tabular numbers for numeric columns.
- **Whitespace is a feature.** A surface with one element and a lot of margin is correct.

---

## 10. Component philosophy

Build on **Base UI** primitives (`@base-ui-components/react`), **not** Radix, **not** shadcn. Every Schedjuice component is hand-composed on top of a Base UI primitive with our tokens. There is no template starter; the design *is* the differentiation.

- Base UI ships unstyled, headless primitives — exactly what we want. The warm tokens carry all visual weight.
- The foundation phase delivers ~20 hand-written primitives (see §13). No app-specific composites (no `<CourseCard>`, no `<AttendanceSheet>`) — those come later, after the foundation is reviewed.
- Forms are deliberately verbose. We compose field-by-field, not field-array-by-schema.
- **Tables:** typography-first, no icon decoration on headers, small-caps Latin headers, tabular numbers, 52px+ row height.
- **Buttons:** text-led. Icons appear only on primary destructive/confirmation actions. Most buttons are text only.

### Mapping legacy Radix → Base UI

The legacy repo uses Radix; Base UI covers the same surface with slightly different naming. Approximate map for reference:

| Legacy Radix | Base UI equivalent |
|---|---|
| `@radix-ui/react-dialog` | `Dialog` (Base UI) |
| `@radix-ui/react-popover` | `Popover` |
| `@radix-ui/react-select` | `Select` |
| `@radix-ui/react-tabs` | `Tabs` |
| `@radix-ui/react-tooltip` | `Tooltip` |
| `@radix-ui/react-toast` | `Toast` |
| `@radix-ui/react-checkbox` | `Checkbox` |
| `@radix-ui/react-radio-group` | `RadioGroup` |
| `@radix-ui/react-switch` | `Switch` |
| `@radix-ui/react-slider` | `Slider` |
| `@radix-ui/react-dropdown-menu` | `Menu` |
| `@radix-ui/react-label` | `Field.Label` |
| `@radix-ui/react-alert-dialog` | `AlertDialog` |
| `@radix-ui/react-separator` | `Separator` |
| `@radix-ui/react-avatar` | (compose with `<img>` + fallback; Base UI has no Avatar — write our own) |
| `@radix-ui/react-progress` | (compose; not in foundation phase) |

If a primitive is missing from Base UI (Avatar, NumberField in some versions), write it ourselves with proper ARIA — do not pull it from elsewhere.

---

## 11. Icon strategy

Reduce icon usage by ~60% from typical SaaS. Icons earn their place.

- **Nav:** icons stay.
- **Form labels:** no icons.
- **Table headers:** no icons.
- **Buttons:** text only, except for destructive / confirm actions.
- **Status:** color + word, icon optional.
- **Empty states:** custom illustration, not icon.

Three icon tiers:

1. **Hero set (15–25 icons)** — custom hand-drawn SVG, slight wobble, organic. Built ourselves over time; not part of foundation phase.
2. **Utility icons** — Iconoir or Phosphor regular weight, used sparingly. Lucide is **banned** unless globally customized for stroke weight and corner radius (we are not doing that work in foundation phase, so just don't import Lucide).
3. **Decorative marks** — rough.js generated.

**Emoji** for achievement states, reactions, kid-facing feedback. Notion-style sparing use.

---

## 12. Motion & sound

- **Motion library:** Motion (formerly Framer Motion). Keep it lean — most transitions are CSS.
- **Animation register:** soft, slightly bouncy easing — paper-and-pencil physics, not slick spring physics. Define 3–4 named easings as tokens; nothing should be hand-typed cubic-bezier in components.
- **Reduced motion:** honor `prefers-reduced-motion: reduce` everywhere. Disable bouncy easings, keep opacity fades.
- **Sound:** school-bell chime on class start (one soft ding, not a full bell loop); paper-rustle for notifications. Every sound has a toggle. **Defaulted off for teachers, on for students.** Sound latency budget: 200ms.
- **No layout-shift hover effects** on tiles, stats, cards. Reserve `active:scale-[0.98]` for buttons only.

---

## 13. Foundation deliverables (this phase only)

The agent ships the following before any application code is written. Everything here must be reviewed and approved before phase 2 (feature surfaces) begins.

### 13.1 Token layer
1. **CSS custom property definitions** for all color, type, spacing, radius, shadow, and motion easing tokens.
2. **Tailwind v4 `@theme` config** that wires the CSS tokens to Tailwind utilities. Semantic aliases (`bg-surface`, `text-primary`, `text-muted`, `border-default`, `ring-accent`) — never raw palette utilities in components.

### 13.2 Base UI primitives (~20)

Hand-composed wrappers around Base UI, each in `src/components/primitives/`. Every primitive: typed props, forwarded ref, keyboard-accessible, focus ring honoring `--ring`, WCAG AA contrast on cream surfaces. (Dark mode is **out of scope** for the foundation phase — cream is the product. Revisit later if needed; do not add dark-mode tokens speculatively.)

1. `Button` (variants: primary, secondary, ghost, danger; sizes: sm, md, lg)
2. `Input` (text, with size variants)
3. `Textarea`
4. `NumberField`
5. `Select`
6. `Combobox`
7. `Checkbox`
8. `RadioGroup`
9. `Switch`
10. `Slider`
11. `Dialog`
12. `AlertDialog`
13. `Sheet` (side panel — compose from Dialog if Base UI doesn't ship it natively)
14. `Popover`
15. `Tooltip`
16. `Tabs`
17. `Toast` (single toaster mount; queue API)
18. `Menu` (dropdown / context-menu primitive)
19. `Field` / `Form` (Label, Description, Error, FieldGroup composition primitives)
20. `Separator`
21. `Avatar` (hand-written; Base UI has no Avatar)

### 13.3 Decoration utilities
- `<PaperGrain />` — SVG noise overlay component, configurable opacity.
- `<RoughUnderline />`, `<RoughFrame />`, `<RoughDivider />`, `<RoughCallout />` — rough.js helpers with seed caching.

### 13.4 Showcase pages

Mounted under `/_design/` (or equivalent — not in production routing). The agent ships all four:

1. **Type scale page** — every type token with sample English and Burmese strings.
2. **Color page** — every color token, every semantic alias, on light surfaces. Show contrast pairings.
3. **Component showcase page** — every primitive in every variant, with keyboard interactions documented inline.
4. **Bilingual stress-test page** — Burmese-only paragraph, mixed-script paragraph, Burmese name in a button, Burmese name in a table cell, Burmese quote in handwriting style, Myanmar-digit currency string, mixed-script form labels with inputs containing both scripts.

If any of the four pages renders incorrectly — broken Burmese rendering, contrast failures, focus rings invisible — the foundation is not done.

---

## 14. Banned list (hard rules)

In rough priority order. **#1 is the positioning anchor; do not negotiate.**

1. **No shadcn UI, in any form.** No `components.json`, no `pnpm dlx shadcn add`, no copy-pasting shadcn source into `components/ui/`, no shadcn-derived class patterns. The `cn()` utility and `cva` library are fine as bare utilities; importing or porting shadcn components is not. Schedjuice does not look like shadcn because shadcn is what everyone else looks like.
2. **No Radix imports.** Base UI only. Clean break.
3. **No vanilla Tailwind UI Kit, daisyUI, NextUI, or template-imported components.**
4. **No accent colors outside the locked palette.** No Ochre, no second warm tone, no Tailwind palette utilities (`bg-blue-500`, `text-gray-700`).
5. **No card-stacking layouts** ("12 widgets in rounded rectangles").
6. **No icon for every label / button.** Read §11.
7. **No exclamation marks** in teacher-facing or admin-facing copy.
8. **No hand-drawn icons below 24px** (illegible at that size).
9. **No gradients between brand colors.** Only allowed gradient is paper-grain noise.
10. **No Lucide imported as-is.** Iconoir or Phosphor only, sparingly.
11. **No stock photography of people around laptops.**
12. **No emoji in primary UI chrome** — only in concentrated personality moments (achievements, reactions, kid-facing feedback).
13. **No `text-transform: uppercase` on Burmese characters.**
14. **No `<hr>`** where a `<RoughDivider />` could carry the meaning.
15. **No hover:scale-* effects** on stat grids, cards, or any non-button surface.
16. **No raw color hex values in components.** Tokens only.

---

## 15. Browser & accessibility baseline

- **Browsers:** Chrome / Edge / Safari, current-2 versions. Firefox current. No IE, no legacy Safari.
- **WCAG AA** on all primitives — contrast, keyboard navigation, focus visibility, screen-reader labels for icon-only buttons (`aria-label`).
- **Focus rings:** visible, themed (`--ring`), never removed for aesthetics.
- **Modal/sheet/drawer titles:** mandatory for screen readers. `sr-only` if visually hidden.
- **External links:** `target="_blank"` always includes `rel="noopener noreferrer"`.
- **Reduced motion:** disable bouncy easings, retain opacity fades.

---

## 16. How "done" is judged

The foundation phase is **complete** when all four showcase pages render correctly, every primitive in §13 is implemented with passing AA contrast and keyboard support, the bilingual stress-test page shows no broken rendering, and a maintainer can screenshot the component showcase next to a vanilla shadcn dashboard and immediately tell which one is Schedjuice.

If the human reviewer cannot do that screenshot test confidently, the design has drifted toward the generic and needs another pass. The differentiation is the deliverable.

---


# PART C — Schedjuice v2 API SDK Brief (full text)

# Schedjuice v2 — API SDK Brief

> **Audience:** the AI agent building the new API SDK for Schedjuice v2.
> **Mode:** SDK-first. No application features built on top of this SDK until the foundation defined here is in place and reviewed.
> **Greenfield rule:** this SDK ships into a clean FE repo. No legacy `src/lib/api.ts`, `src/helpers/*-api.ts`, or `src/app/client-api/` files exist; you are building from scratch. The patterns documented in §2 (Anti-positioning) describe the problems of the predecessor SDK — they are constraints to design against, not code to migrate. You do not have read access to the legacy FE repo; everything you need is in this brief and the backend repo (`schedjuice-reimagined-be`).

---

## 1. What you're building

A typed, isomorphic, two-layer SDK for the Schedjuice REST backend (`schedjuice-reimagined-be`, Django + DRF, mounted at `/api/v1/`). The SDK is the **only** way the application talks to the backend. After this phase, no component, hook, or page imports `axios` directly.

The SDK has two layers:

1. **Imperative client** — `sdk.courses.list({ where })`, `sdk.courses.get(id)`, `sdk.users.me()`. Pure functions. No React. Runs in RSCs, route handlers, Node scripts, tests, and the browser.
2. **Thin hooks layer** — `useCoursesList({ where })`, `useCourse(id)`, `useUpdateCourse()`. Tanstack-query wrappers over the imperative client. Hides query keys, default options, `enabled` logic, abort plumbing.

The SDK runs **isomorphically**: pages do `await sdk.courses.list(...)` on the server, dehydrate the query into `HydrationBoundary`, and the matching `useCoursesList` hook on the client picks up the cache without a re-fetch. This is how we kill the first-paint waterfall before it can exist.

You are not building application features in this phase. But every design choice must survive contact with a finance table that filters 8 ways, a quiz attempt list of 500 rows, a chat thread, and a tenant-scoped reporting endpoint that returns a custom `summary` field.

**Backend access.** You have write access to both this repo and the backend repo (`schedjuice-reimagined-be`). When a needed backend change is discovered — a missing batch endpoint, a serializer field that should exist, a wrong response shape — make the change directly in the backend rather than working around it on the FE side. Read the relevant Django serializer / view first; follow existing patterns in the surrounding app. Backend changes ship in the same commit (or adjacent commits) as the FE code that depends on them.

---

## 2. Anti-positioning — why this SDK exists

The predecessor SDK (in the legacy repo you do not have access to) had six structural problems documented during a teardown. This brief is designed against each of them — they are constraints, not code you need to inspect:

1. **There is no SDK boundary.** `axiosClient` is imported directly in ~50 components, hooks, and pages. Every consumer reinvents URL composition, response unwrapping, and error handling. A backend rename means grepping the whole tree.
2. **The backend envelope (`{ data, isError, message, summary }`) leaks four levels deep.** Consumers write `data?.data.data.name`. Three different unwrap shapes exist on the same endpoint family.
3. **Types are essentially `any`.** Helpers return `Promise<AxiosResponse<any>>`. Hand-typed entity definitions exist in `src/types/*.ts` but are only ever used as **call-site casts**, never enforced at the SDK boundary.
4. **N+1 was endemic.** Lists ran one `useQuery` per row. Inline cells fired one mutation per cell. Six-step serial waterfalls (each query gated on `enabled: Boolean(prevQuery.data)`) blocked first paint. The new SDK makes these shapes impossible by construction.
5. **Query keys are stringly-typed and template-literal-built.** `[\`get${entityName}\`, entityId, isEdit]`. Invalidations don't match the keys the lists actually use, so creates don't invalidate the tables that show them.
6. **DRY at the helper, WET at the consumer.** Six generic helpers exist, but custom routes (~30–40% of the backend) bypass them entirely into raw `axiosClient.get(...)`. The base64-array-encoder is reimplemented inline in two more files. The `enabled: Boolean(courseId)` pattern is repeated dozens of times.

The new SDK eliminates each of these by construction. If a primitive in this spec doesn't visibly kill at least one of the six, it doesn't belong in the foundation.

---

## 3. Architectural principles

These principles are not negotiable. Every design decision in §§4–13 follows from them.

1. **The SDK is the boundary.** Outside `src/sdk/**`, nothing imports axios, raw fetch, or hand-builds an API URL. Period.
2. **Generic CRUD lives once.** The `list / get / create / update / delete / search` verbs are implemented exactly one time, in `core/`. Resources consume them via a small `defineResource` factory.
3. **Resources are thin.** A vanilla CRUD resource is ~10 lines. Resources only grow when they have custom routes or domain helpers; those live in the same file (or folder for resources with many).
4. **Types come from the serializer.** No codegen. The agent reads the matching Django serializer, hand-writes the TypeScript type in `_types/`, and cites the serializer in a docblock. Drift is prevented by discipline + verification tests, not by a toolchain.
5. **Everything is typed.** No `any`. Filter params are a typed builder, not a `{ field_name, operator, value }` literal. The envelope is unwrapped at the SDK boundary; consumers see typed payloads.
6. **Isomorphic by default.** The imperative client runs on both the server (Next.js RSCs, route handlers) and the client (browser). Auth and tenant resolution have one server path and one client path; consumers never know which is running.
7. **No waterfalls, no N+1.** The patterns that produce them are banned by the spec (see §13). Where the backend can't currently batch, the agent adds the batch endpoint to the backend, then wraps it in the SDK.
8. **Query keys are factory-generated.** Stringly-typed keys and template-literal keys are banned. Invalidations resolve through the factory, not by guessing.

---

## 4. File layout

```
src/sdk/
  core/
    fetcher.ts          # isomorphic fetch (axios under the hood); server reads Next.js cookies(),
                        # client reads cookies-next; both add Authorization + X-Tenant
    envelope.ts         # unwrap { data, isError, message, summary } -> typed payload OR throw ApiError
    error.ts            # ApiError class; field-level errors, network errors, 401 / 403 / 404 / 5xx mapping
    auth.ts             # cookie read (dual-path via next/headers + cookies-next) and write
                        # (client-only via cookies-next). Used by fetcher (read) and resources/auth.ts (write).
    tenant.ts           # X-Tenant header resolution from the `schema` cookie; same dual-path shape
                        # as auth. NOTE: this is HEADER plumbing; the tenant OBJECT lives in resources/tenants.ts.
    host.ts             # forward the request's Host / Origin header on the server (via next/headers headers())
                        # so unauthenticated tenant-resolution requests work. Client path is a no-op
                        # (browser sets Origin automatically).
    types.ts            # Page<T>, ListResult<T, S>, FilterParams, WhereClause<T>, SortClause<T>, OperatorEnum
    define-resource.ts  # the generic CRUD factory that resources consume
    query-key-factory.ts# createQueryKeys utility; produces typed key trees
    query-client.ts     # configured QueryClient; stale-time tiers; retry policy; abort plumbing
    hydration.ts        # dehydrate / hydrate helpers for RSC pages
    invariants.ts       # dev-only: detect .map(useQuery), template-literal keys, raw axios imports
  _types/
    auth.ts             # cites app_auth/views.py::LoginView, ::MSLoginView
    tenants.ts          # cites app_org/serializers.py::OrganizationSerializer (or wherever the
                        # Organization serializer actually lives — confirm against the backend)
    users.ts            # hand-typed; cites app_auth/serializers.py::UserSerializer
    courses.ts          # cites app_course/serializers.py::CourseSerializer
    attachments.ts      # cites app_attachment/serializers.py::AttachmentSerializer
    common.ts           # shared enums (UserRole, PaymentStatus, etc.)
  resources/
    auth.ts             # login, loginMicrosoft (reads MSAL config from current tenant), logout;
                        # wraps MSAL; writes cookies via core/auth.ts
    tenants.ts          # CRUD via defineResource (backend path: "organizations") + current()
                        # custom route for the unauthenticated /organizations/public endpoint
    users.ts            # imperative client + custom routes (me, available-for-timeslot); single file
    courses/
      index.ts          # base resource via defineResource + custom routes (zoom, students,
                        # payment-assignment-month-status); folder because the route surface is wide
      students.ts       # nested-resource client for courses/<id>/students
      zoom.ts           # nested-resource client for courses/<id>/zoom-meeting/*
    attachments.ts      # imperative client + the batch primitive listForEntities
  hooks/
    auth.ts             # useLogin, useLoginMicrosoft, useLogout
    tenants.ts          # useTenantCurrent, useTenant (by id), useTenantsList, useUpdateTenant
    users.ts            # useUserMe, useUserById, useUpdateUser
    courses.ts          # useCoursesList, useCourse, useCreateCourse, useUpdateCourse,
                        # useCourseStudents (nested), etc.
    attachments.ts      # useAttachmentsForEntity, useAttachmentsForEntities (batch)
  keys/
    auth.ts             # queryKeys.auth (minimal; auth is mostly mutations)
    tenants.ts          # queryKeys.tenants
    users.ts            # queryKeys.users
    courses.ts          # queryKeys.courses
    attachments.ts      # queryKeys.attachments
    index.ts            # export const queryKeys = { auth, tenants, users, courses, attachments }
  index.ts              # export const sdk = { auth, tenants, users, courses, attachments };
                        # export { queryKeys, ApiError, ... }
  README.md             # SDK usage guide: how to add a resource, read cache from RSC, etc.
```

The file layout is **shallow on purpose**. The agent does NOT create `client.ts / hooks.ts / keys.ts / index.ts` per resource. Vanilla resources are a single file in `resources/`. Folders only appear when a resource has more than two custom routes (Courses qualifies; Users and Attachments don't).

---

## 5. Type sourcing rule

**No codegen.** Types are hand-written, sourced from the backend serializer, and cited in a docblock.

For every type in `_types/<resource>.ts`:

```ts
/**
 * @source app_course/serializers.py::CourseSerializer
 * @endpoint GET /api/v1/courses, GET /api/v1/courses/<id>
 *
 * Notes:
 * - `category` and `subject` are FK ids; expand=["category","subject"] returns nested objects.
 * - `student_count` and `main_teacher_count` are read-only annotations; not on create/update payloads.
 */
export type Course = {
  id: number;
  title: string;
  // ...
};

/** @source app_course/serializers.py::CourseSerializer (write-only fields filtered) */
export type CourseCreate = Pick<Course, "title" | "category" | "subject" | "start_date" | "end_date">;
```

**The rule:** before adding or changing any type in `_types/`, the agent opens the matching `app_<x>/serializers.py` (and the view if it returns a custom shape), reads it, and writes the type to match. The docblock cites the serializer file + class. Diverging from the serializer without updating the docblock is a banned-list violation (see §16).

Custom-shape endpoints (admin reports, search summaries, bulk-action responses) also live in `_types/` next to the resource, with a docblock citing the view file + class.

If the backend doesn't expose a clean type for something (e.g., `users/available-for-timeslot` returns a hand-shaped dict instead of a serialized model), the agent writes the type from the view code and notes the source in the docblock.

---

## 6. The resource pattern

### 6.1 Generic CRUD core

```ts
// src/sdk/core/define-resource.ts
export type ResourceConfig = {
  path: string;          // "courses", "users", "attachments"
  searchable?: boolean;  // does the backend expose path/search ?
};

export function defineResource<TRead, TCreate = Partial<TRead>, TUpdate = Partial<TRead>>(
  config: ResourceConfig,
) {
  return {
    list:   (q?: ListQuery<TRead>)              => coreList<TRead>(config.path, q),
    get:    (id: number | string, opts?: GetOptions<TRead>) => coreGet<TRead>(config.path, id, opts),
    search: config.searchable
              ? (q: ListQuery<TRead>, where: WhereClause<TRead>) =>
                  coreSearch<TRead>(config.path, q, where)
              : undefined,
    create: (data: TCreate) => coreCreate<TRead>(config.path, data),
    update: (id: number | string, data: TUpdate) => coreUpdate<TRead>(config.path, id, data),
    remove: (id: number | string) => coreRemove(config.path, id),
  };
}
```

`coreList`, `coreSearch`, etc. live in `core/` and call `fetcher` + `envelope.unwrap`. CRUD is written exactly once.

### 6.2 Vanilla resource — single file

```ts
// src/sdk/resources/campuses.ts (illustration; campuses is NOT in foundation scope)
import { defineResource } from "@/sdk/core/define-resource";
import type { Campus, CampusCreate } from "@/sdk/_types/campuses";

export const campuses = defineResource<Campus, CampusCreate>({
  path: "campuses",
  searchable: true,
});
```

That's the whole resource. Consumer gets `sdk.campuses.list({ where })`, `sdk.campuses.get(id)`, etc., fully typed.

### 6.3 Resource with custom routes

```ts
// src/sdk/resources/users.ts
import { fetcher } from "@/sdk/core/fetcher";
import { defineResource } from "@/sdk/core/define-resource";
import type { User, UserCreate, UserAvailability } from "@/sdk/_types/users";

const base = defineResource<User, UserCreate>({ path: "users", searchable: true });

export const users = {
  ...base,
  /** GET users/me — currently authenticated account. */
  me: () => fetcher.get<User>("users/me"),
  /** GET users/available-for-timeslot — staff free in a month/weekday/timeslot grid (tenant timezone). */
  availableForTimeslot: (params: {
    yearMonth: string; timeFrom: string; timeTo: string; weekdays: string;
  }) => fetcher.get<UserAvailability>("users/available-for-timeslot", { params }),
};
```

### 6.4 Resource with many custom routes — folder

```ts
// src/sdk/resources/courses/index.ts
import { fetcher } from "@/sdk/core/fetcher";
import { defineResource } from "@/sdk/core/define-resource";
import type { Course, CourseCreate, PaymentAssignmentMonthStatus } from "@/sdk/_types/courses";
import { students } from "./students";
import { zoom } from "./zoom";

const base = defineResource<Course, CourseCreate>({ path: "courses", searchable: true });

export const courses = {
  ...base,
  students,
  zoom,
  /** GET courses/<id>/payment-assignment-month-status?year=&month= */
  paymentAssignmentMonthStatus: (courseId: number, year: number, month: number) =>
    fetcher.get<PaymentAssignmentMonthStatus>(
      `courses/${courseId}/payment-assignment-month-status`,
      { params: { year, month } },
    ),
};
```

```ts
// src/sdk/resources/courses/students.ts
import { fetcher } from "@/sdk/core/fetcher";
import type { CourseStudent } from "@/sdk/_types/courses";

export const students = {
  list:   (courseId: number)                       => fetcher.get<CourseStudent[]>(`courses/${courseId}/students`),
  add:    (courseId: number, userId: number)      => fetcher.post(`courses/${courseId}/students`, { user_id: userId }),
  remove: (courseId: number, userId: number)      => fetcher.delete(`courses/${courseId}/students/${userId}`),
};
```

### 6.5 Domain helpers live with the resource

```ts
// src/sdk/resources/courses/index.ts (continued)
export const courseFilters = {
  /** Courses where the given user is a member (student, teacher, or staff). */
  forUser: (user: User): WhereClause<Course> => ({
    user_courses__user_id: { eq: user.id },
  }),
};
```

Filters like "courses this user is enrolled in" tend to get reinvented at every call site. The resource module is their single home; every consumer reads `courseFilters.forUser(user)` instead of hand-building the filter literal.

---

## 7. Query keys & invalidation

### 7.1 Centralized factory

```ts
// src/sdk/keys/courses.ts
import { createQueryKeys } from "@/sdk/core/query-key-factory";

export const coursesKeys = createQueryKeys("courses", {
  list:   (q?: ListQuery<Course>)                => ["list", q ?? null] as const,
  detail: (id: number | string)                  => ["detail", id] as const,
  search: (q: ListQuery<Course>, w: WhereClause<Course>) => ["search", q, w] as const,
  students:                  (id: number)        => ["students", id] as const,
  paymentAssignmentMonth: (id: number, y: number, m: number) =>
                                                    ["payment-assignment-month", id, y, m] as const,
});

// Usage:
queryKeys.courses.list({ where: { id: 5 } });       // ["courses", "list", { where: { id: 5 } }]
queryKeys.courses.list._key;                         // ["courses", "list"]  — for prefix invalidation
queryKeys.courses._key;                              // ["courses"]          — nuke everything for the resource
```

Every hook uses the factory. Every `invalidateQueries` call uses the factory. Stringly-typed keys (`["searchcourses", uid, ...]`) are banned by lint (see §16).

### 7.2 Invalidation pattern

Mutations call `invalidateQueries` explicitly inside `onSuccess`, using the factory:

```ts
// src/sdk/hooks/courses.ts
export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; data: CourseUpdate }) =>
      sdk.courses.update(args.id, args.data),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(args.id) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.list._key });
      qc.invalidateQueries({ queryKey: queryKeys.courses.search._key });
    },
  });
}
```

No tag-based magic. No auto-invalidation. The invalidations are written next to the mutation that needs them, in a place where they can be reviewed.

---

## 8. The fetcher, envelope, and error model

### 8.1 Fetcher

`core/fetcher.ts` wraps axios with:

- Server vs client cookie/header resolution (see §9).
- Base URL from `process.env.NEXT_PUBLIC_BASE_API_URL` (see `.env.example` at the repo root for the full env-var inventory).
- `AbortSignal` accepted by every method.
- **Automatic envelope unwrap.** Every `fetcher.get / post / put / delete` call runs the response through `envelope.unwrap` (§8.2) before returning. Consumers of `fetcher` — including `coreList`, `coreGet`, and the custom-route methods on resources (`users.me`, `courses.paymentAssignmentMonthStatus`, etc.) — receive the typed payload, never the raw `{ data, isError, ... }` shape. If `isError === true`, the fetcher throws `ApiError`.
- 401 → throws `ApiError` with `code === "unauthorized"`; the hooks layer is responsible for routing to `/login` (not the fetcher).
- No `retry`. Retries are configured on the QueryClient (queries: 1; mutations: 0).

### 8.2 Envelope

The backend wraps every response as:

```jsonc
// list / search
{ "data": [...], "summary"?: {...} }

// detail
{ "data": {...} }

// error
{ "isError": true, "message": "...", "errors"?: {...} }
```

`core/envelope.ts` unwraps once at the SDK boundary. Consumers receive:

- `T` for detail endpoints.
- `ListResult<T>` for list endpoints: `{ items: T[]; page: number; size: number; total: number; hasMore: boolean }`. `page` is 1-indexed (matches the backend); `total` is the unpaginated row count; `hasMore` is derived from `page * size < total`.
- `ListResult<T, S>` for endpoints with a summary (admin reports, etc.): adds `summary: S`.

**Confirm the exact pagination field names against the backend's paginator class** before writing `envelope.ts` (open the relevant `app_*/pagination.py` or check the DRF settings). If the backend uses different names (e.g., `count` / `next` / `previous` for DRF's default `PageNumberPagination`), map them to the field names above inside `envelope.ts`. The **public shape is non-negotiable** — consumers see `{ items, page, size, total, hasMore }` regardless of backend internals.

If `isError === true`, the envelope throws `ApiError`. The fetcher never returns the raw envelope to consumers.

### 8.3 Error model

```ts
// src/sdk/core/error.ts
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;        // "validation_error" | "unauthorized" | "not_found" | "network" | "unknown"
  readonly fieldErrors?: Record<string, string[]>;  // for 400 validation responses
  readonly cause?: unknown;
}
```

The hooks layer treats `ApiError.code === "unauthorized"` specially: it triggers the auth redirect once per session, not on every 401. Form mutations consume `fieldErrors` to wire `react-hook-form` field errors.

---

## 9. Auth & tenant — isomorphic

Auth and tenant headers must work on both the server and the client without consumer code knowing the difference.

### 9.1 Token

- **Server (RSC / route handler):** `cookies().get("access")?.value` from `next/headers`.
- **Client (browser):** `getCookie("access")` from `cookies-next`.

`core/auth.ts` exposes four functions:

- `getAccessToken(): string | undefined` — isomorphic; used by the fetcher to attach `Authorization` headers. Dual-path (server / client).
- `getAccount(): { id: number; ... } | undefined` — isomorphic; read from the `account` cookie. Dual-path.
- `setAuthCookies({ access, account, schema })` — **client-only** in foundation. Uses `cookies-next` to write all three with a 2-hour TTL. (Server-side cookie writes require a route handler or server action context; since foundation keeps all mutations client-side per §15, no server write path is needed yet. Phase 2 may add one when auth moves to a server action.)
- `clearAuthCookies()` — **client-only**, same reason as above.

Calling `setAuthCookies` or `clearAuthCookies` from an RSC throws a clear error pointing at the §15 non-goal.

### 9.2 Tenant (`X-Tenant`)

Same dual-path shape in `core/tenant.ts`. Server reads from `cookies().get("schema")`; client reads from `cookies-next`. The fetcher attaches `X-Tenant: <schema>` to every request.

### 9.3 Token refresh — out of scope for foundation

The backend issues 2-hour tokens; the SDK reads them as-is and does not implement refresh-before-expiry in foundation. **Token refresh is a follow-up workstream** (see §15 — non-goals). Do not design the SDK in a way that would prevent adding refresh later: the fetcher should already support an interceptor-style hook for it.

---

## 10. Hooks layer

The hooks layer is thin: tanstack-query wrappers over the imperative client. Every hook:

- Uses a key from the factory in §7.
- Plumbs `AbortSignal` through to the imperative client.
- Defaults `staleTime` from the tier in §10.1; per-call overrides require a brief comment explaining why.
- Returns the **typed payload** (post-envelope-unwrap), not the raw response.

### 10.1 Stale-time tiers

Defined as constants in `core/query-client.ts`. Hooks pick a tier by name, not by raw ms:

```ts
export const STALE = {
  /** Reference data the user rarely changes; tenant config, custom field definitions, payment methods. */
  REFERENCE: 60 * 60 * 1000,        // 1 hour
  /** User / tenant identity; the current account, the current tenant. */
  IDENTITY: 5 * 60 * 1000,          // 5 minutes
  /** Lists, search results, dashboards. */
  SEARCH: 30 * 1000,                // 30 seconds
  /** Real-time-ish data; chat, attendance, notifications. */
  LIVE: 0,
};
```

Per-call override:

```ts
useQuery({ ..., staleTime: STALE.LIVE,
  // chat lists are stale immediately; WS will revalidate
});
```

### 10.2 Retry policy

- Queries: `retry: 1` with exponential backoff. Network errors get one retry; ApiErrors (4xx) never retry.
- Mutations: `retry: 0`. We do not silently re-fire writes.

### 10.3 Default options

`core/query-client.ts` ships one configured `QueryClient` for the client and one for the server (the server one has `staleTime: Infinity` so dehydrated cache isn't immediately refetched on hydration). Beyond stale time and retry, no other defaults are set globally; per-resource behavior lives in the resource's hooks file.

### 10.4 Abort signals

Every hook accepts `signal: AbortSignal` from tanstack and forwards it to the imperative client. Imperative client forwards it to the fetcher. Tests verify cancellation works through the whole stack.

---

## 11. Filter & query builder

Today consumers write `{ field_name: "course_id", operator: operatorEnum.exact, value: String(id) }`. The new SDK exposes a typed builder:

```ts
sdk.courses.search(
  { sort: ["-created_at"], expand: ["category"] },
  {
    title: { icontains: "math" },
    category: { eq: 7 },
    user_courses__user_id: { eq: user.id },     // Django __ lookups still allowed
    OR: [{ is_active: true }, { is_archived: false }],
  },
);
```

The builder compiles to the backend's `{ filter_params: [...] }` shape inside `coreSearch`. Consumers never write the raw shape.

- Common operators get sugar: `id: 5` is shorthand for `{ eq: 5 }`.
- Django lookups (`course__user_courses__user_id`) are accepted as string keys with a literal-string type so typos surface.
- `expand`, `sort`, `fields`, `page`, `size` are part of `ListQuery<T>`; type-narrowed to the resource's actual field names where possible.
- The backend expects `sorts` / `expand` / `fields` as base64-encoded JSON arrays in the query string (`base64(JSON.stringify([...]))`). This encoding is performed inside `coreList` / `coreSearch` — never by consumers, never re-implemented elsewhere.

---

## 12. RSC + dehydration

The brief's biggest performance win. Pages do their data fetching on the server, dehydrate the cache, and the client hooks pick up the cache without a network round-trip.

### 12.1 Pattern

```tsx
// app/(internal)/courses/[id]/page.tsx (RSC)
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createServerQueryClient } from "@/sdk/core/query-client";
import { sdk } from "@/sdk";
import { queryKeys } from "@/sdk/keys";
import CourseDetailsClient from "./course-details-client";

export default async function CoursePage({ params }: { params: { id: string } }) {
  const qc = createServerQueryClient();
  const id = Number(params.id);

  // Parallel server prefetch — no waterfall.
  await Promise.all([
    qc.prefetchQuery({ queryKey: queryKeys.courses.detail(id),  queryFn: () => sdk.courses.get(id) }),
    qc.prefetchQuery({ queryKey: queryKeys.courses.students(id), queryFn: () => sdk.courses.students.list(id) }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CourseDetailsClient id={id} />
    </HydrationBoundary>
  );
}
```

```tsx
// app/(internal)/courses/[id]/course-details-client.tsx ("use client")
import { useCourse, useCourseStudents } from "@/sdk/hooks/courses";

export default function CourseDetailsClient({ id }: { id: number }) {
  const { data: course } = useCourse(id);              // hydrated from server, no network
  const { data: students } = useCourseStudents(id);    // hydrated from server, no network
  // ...
}
```

### 12.2 What this kills

The naïve client-side shape — chained hooks each gated on `enabled: Boolean(prevQuery.data)`, producing a six-step serial waterfall on first paint — becomes one `Promise.all([...])` on the server. First paint is the *server* finishing, not six client round-trips.

---

## 13. Forbidden patterns (the N+1 ban)

These are banned by the spec and enforced by lint (see §16).

1. **`.map(useQuery)` / `.map(useMutation)`.** Replaced by either:
   - A batch primitive on the resource (`sdk.attachments.listForEntities([{ table, id }])`).
   - `useQueries` from tanstack — the only legal way to fan out parallel fetches.
2. **`enabled` chains — gating one query on another query's data.** Banned shape: `useFoo({ enabled: Boolean(barQuery.data) })`. Replaced by either:
   - Server prefetch (RSC + `HydrationBoundary`) — the default for first-paint data.
   - Parallel fetch via `useQueries` or `Promise.all` in the imperative client.
   - (`enabled: !!id` where `id` comes from a route param, form state, or other non-query input is **fine** — that's input-gating, not chaining. The ban is specifically `enabled` reading from another `useQuery`'s `.data`.)
3. **Per-row mutations from a list.** If a user can change N rows in a row, the SDK exposes a bulk endpoint. Where one doesn't exist, the agent adds the bulk endpoint to the backend, then wraps it in the SDK.
4. **`refetchOnMount: false` to mask missing `staleTime`.** Set the right tier (§10.1) and let `refetchOnMount` keep its default. Overrides require a comment.
5. **`retry: > 0` on mutations.** Mutations do not retry. Period.
6. **Stringly-typed `invalidateQueries({ queryKey: ["searchfoo"] })`.** Must go through `queryKeys.<resource>.<bucket>._key`.

When the agent encounters an N+1 risk in foundation-resource code (e.g., a list view that would naively fetch a related entity per row), it writes the batch primitive in the relevant resource (adding the backend endpoint if one doesn't exist) — never reimplements the N+1 in new code.

---

## 14. Foundation deliverables

The agent ships the following before any application code is built on top of the SDK. Everything here must be reviewed and approved before phase 2 (the FE's application surfaces — pages, dashboards, forms — start landing).

### 14.1 Core layer (`src/sdk/core/*`)
Every file in §4 implemented, typed, and tested. Specifically:

- `fetcher.ts` with isomorphic auth + tenant header attachment, abort plumbing, base URL handling.
- `envelope.ts` unwrapping all three envelope shapes (detail / list / error) into typed payloads.
- `error.ts` with the `ApiError` class and the four canonical codes.
- `define-resource.ts` returning the six CRUD verbs typed to the resource's `TRead / TCreate / TUpdate`.
- `query-key-factory.ts` producing keys with `._key` accessors for prefix invalidation.
- `query-client.ts` with the four `STALE` tiers, the retry policy, and a server-variant for SSR.
- `hydration.ts` exporting `createServerQueryClient`, `dehydrate`, `HydrationBoundary` re-export.
- `invariants.ts` dev-only assertions: detect `.map(useQuery)`, template-literal keys, raw axios imports outside `src/sdk/`.

### 14.2 Five foundation namespaces

**Auth** — `src/sdk/resources/auth.ts`, `src/sdk/hooks/auth.ts`, `src/sdk/keys/auth.ts`, `src/sdk/_types/auth.ts`.
- Login flow: `login({ email, password })`, `loginMicrosoft()`, `logout()`.
- Cookie side effects happen **inside the SDK boundary**, never in calling code. Login / logout are mutations and run client-side (per §15), so cookie writes use `cookies-next` via `core/auth.ts`'s `setAuthCookies` / `clearAuthCookies` helpers (§9.1). Reads stay dual-path.
- `loginMicrosoft()` wraps `@azure/msal-browser` (`PublicClientApplication`, `loginPopup`). **MSAL config is per-tenant, not env-based.** It reads `authority` and `app_id` from `sdk.tenants.current()` (the unauthenticated tenant-resolution endpoint, see Tenants below) and uses them to initialize `PublicClientApplication`. After `loginPopup` resolves, it posts the resulting access token to `POST /api/v1/ms-login`. MSAL initialization happens inside the SDK; consumers never touch MSAL types or pass config in.
- Successful login writes `access`, `account`, and `schema` cookies (2-hour TTL, matching the backend token lifetime). Logout clears them all.
- Types in `_types/auth.ts` cite `app_auth/views.py::LoginView` and `app_auth/views.py::MSLoginView`.
- Hooks: `useLogin()`, `useLoginMicrosoft()`, `useLogout()`. Each clears the React Query cache (`queryClient.clear()`) on success — `useLogout` so the next visitor on a shared device doesn't see the previous account's data; `useLogin` / `useLoginMicrosoft` to handle re-login (token expiry, account-switch) without leaking the old user's cache into the new user's session.
- Auth is exported alongside other namespaces: `sdk.auth.login(...)`, `sdk.auth.logout()`. It is NOT a CRUD resource (no `defineResource`), but it lives in the same folder for consistency.

**Tenants** — `src/sdk/resources/tenants.ts`, `src/sdk/hooks/tenants.ts`, `src/sdk/keys/tenants.ts`, `src/sdk/_types/tenants.ts`.
- Backend resource path is `organizations`. The FE-facing name is `tenants` because that's how the rest of the codebase (cookies, headers, UI copy) refers to it. The translation lives in one place: `defineResource<Tenant>({ path: "organizations", ... })`.
- Full CRUD via `defineResource`.
- Custom routes:
  - `current()` — hits the **unauthenticated** `GET /api/v1/organizations/public` and returns the tenant matching the request's Host. This is the entry point that resolves `authority` / `app_id` for MSAL login, plus branding (`domain_url`, `is_microsoft_on`, etc.). On the server, `core/host.ts` forwards the incoming request's Host header as `Origin`; on the client, the browser sets `Origin` automatically. Wrapped in React's `cache()` so RSCs that read it more than once in a single request don't double-fetch.
- Hooks: `useTenantCurrent()` (used by login pages, branding, the public-tenant flow), `useTenant(id)`, `useTenantsList(...)`, `useUpdateTenant()`.
- Stale-time tier: `STALE.IDENTITY` for `current()` (rare changes within a session); `STALE.REFERENCE` for individual tenant detail/list (admin views).
- The Tenant type cites the Organization serializer in the backend; if the type currently lives partly in a custom view response (some legacy fields), document each in the docblock.

**Users** — `src/sdk/resources/users.ts`, `src/sdk/hooks/users.ts`, `src/sdk/keys/users.ts`, `src/sdk/_types/users.ts`.
- CRUD via `defineResource`.
- Custom: `me()`, `availableForTimeslot({ yearMonth, timeFrom, timeTo, weekdays })`.
- Hooks: `useUserMe`, `useUserById`, `useUpdateUser`, `useUserAvailability`.
- `useUserMe` is the single source of truth for the currently-authenticated account; every consumer that needs the current user reads from this hook (or, on the server, awaits `sdk.users.me()` and dehydrates). No parallel current-user hook may exist outside the SDK.

**Courses** — `src/sdk/resources/courses/{index,students,zoom}.ts`, hooks, keys, types.
- Full CRUD + search via `defineResource`.
- Custom routes: `paymentAssignmentMonthStatus`, `meetingAttendanceDashboard`, `generateJoinCode`, `availableUsers`.
- Nested: `courses.students.{list, add, remove}`, `courses.zoom.{schedule, update, refresh, validate}`.
- Domain helpers: `courseFilters.forUser(user)`.
- Hooks cover all of the above.

**Attachments** — `src/sdk/resources/attachments.ts`, hooks, keys, types.
- Existing `attachments/search` with `foreign_key` filter is the batch primitive — wrap it as `sdk.attachments.listForEntities([{ table, id }])`. Confirm the existing search supports an `IN`-style foreign-key filter; if it only supports single-FK, add the multi-FK variant to the backend (one extra `__in` lookup) and ship it in the same commit.
- Two hooks, two intents:
   - `useAttachmentsForEntity(table, id)` — for a **single-entity** detail page. Fine to use directly.
   - `useAttachmentsForEntities(entities)` — for a **list**. Returns a `Map<string, Attachment[]>` keyed by `${table}:${id}` for O(1) row lookup.
- **Lint rule:** `useAttachmentsForEntity` is flagged when it appears inside an array `.map(...)` callback or inside a JSX list (`{items.map(item => <Row>...</Row>)}` body that calls the singular hook). That's the N+1 shape. The fix is always to lift the call up: parent calls `useAttachmentsForEntities`, rows read from the returned `Map`.
- File upload (chunked tus, image editing) is **out of scope** for foundation. The resource leaves room for a future `upload()` method.

### 14.3 Verification

- **Unit tests (vitest)** for every `core/*` module. Envelope unwrapping (all three shapes), error mapping, key factory output, filter-param builder, auth/tenant resolution (mocked).
- **Integration tests** (vitest with a mocked fetcher) for each reference resource: CRUD, search, custom routes, batch primitive.
- **One end-to-end RSC example** at `src/app/(dev)/sdk-rsc-example/page.tsx` (reachable at `/sdk-rsc-example`; route group `(dev)` keeps it grouped with other dev-only pages without affecting the URL, and is removed before phase 2 ships). The page does parallel `Promise.all` prefetch of a Course + its students + attachments, dehydrates, hydrates, and the client component shows `useCourse(id) / useCourseStudents(id) / useAttachmentsForEntity("courses", id)` with **zero client-side network requests on first paint**. This page is the SDK's litmus test for §12.
- **Lint rule** (eslint plugin or a custom `pnpm sdk:check` script) enforcing the patterns in §13 and §16.

### 14.4 SDK README (usage guide)

`src/sdk/README.md` containing the recipes a future engineer (or agent) needs to add the remaining ~21 resources without consulting this brief:

- **"How to add a new resource" recipe.** End-to-end walkthrough using one of the foundation resources as the worked example: open `app_<x>/serializers.py`, write the type in `_types/<resource>.ts` with a `@source` docblock, define the resource via `defineResource` (single file) or a folder with custom-routes files, add hooks in `hooks/<resource>.ts`, add keys in `keys/<resource>.ts`, write tests.
- **"How to read the cache from an RSC" recipe.** The pattern from §12, distilled: `createServerQueryClient` → `Promise.all` prefetches → `dehydrate` → `HydrationBoundary` → client hook reads from cache.
- **"What to do when you hit a missing batch endpoint" recipe.** Add the view + url to the matching backend app (read existing views in `app_<x>/views.py` for the style; follow the codebase's `IsAuthenticated` + `*SearchView` pattern), write the SDK type with a serializer-citation docblock, expose via `defineResource` or a custom method on the resource.
- **"How to invalidate after a mutation" recipe.** Shows the key-factory pattern from §7.2, with three worked examples: invalidate a single detail, invalidate all lists for a resource, invalidate across resources after a relationship change.
- **STALE-tier guidance table.** One row per `STALE` tier from §10.1 ("REFERENCE / IDENTITY / SEARCH / LIVE"), each with a one-sentence "use this when…" and two example endpoints.
- **Error-handling recipe.** How `ApiError.code` is consumed; the 401-once-per-session redirect rule; how `ApiError.fieldErrors` maps into `react-hook-form` field errors via a small `setFormErrorsFromApi(form, err)` helper.
- **A "common anti-patterns" callout** that links each §13 / §16 banned rule to a code example of what NOT to do and the typed alternative.

---

## 15. Non-goals (foundation phase)

Explicitly out of scope. Do not design defensively for these; do not partially implement them.

- OpenAPI / Swagger codegen.
- Chat / WebSocket SDK integration.
- File upload (tus, chunked, image editing).
- Token refresh. The SDK preserves a 2-hour cookie TTL; refreshing before expiry is a follow-up workstream. The fetcher should support an interceptor-style hook so refresh can be added later without restructuring.
- Server actions (Next.js) for mutations. Mutations stay on the client in foundation.
- A type-safe SDK for the WebSocket protocol — phase 2.
- **Resource scaffolding CLI.** Foundation builds the five namespaces (Auth, Tenants, Users, Courses, Attachments) by hand; a CLI to scaffold the other ~21 resources from the backend's `urls.py` is phase 2.
- **Application features on top of the SDK.** No pages, no UI components, no dashboards in this phase. Other than the RSC litmus-test page in §14.3, the foundation ships only the SDK itself plus its tests.

---

## 16. Banned list (hard rules)

In rough priority order. **#1 is the architectural anchor; do not negotiate.**

1. **No raw axios outside `src/sdk/`.** No `import { axiosClient } from "@/lib/api"` in any component, hook, page, or helper outside the SDK.
2. **No `fetch` outside `src/sdk/`.** The same rule, restated for completeness.
3. **No per-row `useQuery` or `useMutation`.** Use a batch primitive or `useQueries`.
4. **No `enabled: Boolean(prevQuery.data)` chains.** Prefetch on the server or fetch in parallel.
5. **No `.map(useQuery)`.** Lint-enforced.
6. **No template-literal query keys.** Lint-enforced. Keys come from the factory.
7. **No `invalidateQueries` with a hand-built string key.** Must go through `queryKeys.<resource>.<bucket>._key`.
8. **No reading `res.data.data` in consumer code.** The envelope is unwrapped at the SDK boundary.
9. **No `any` in SDK exports.** Including via `as any` casts. `unknown` is acceptable where the shape is genuinely unknown (e.g., the `graphics_data` JSON field on certificate templates).
10. **No API helper outside `src/sdk/`.** Every function that issues an HTTP request lives inside the SDK boundary. No `src/helpers/<x>-api.ts`, no `src/lib/<x>-api.ts`, no ad-hoc `src/app/<x>/api.ts`.
11. **No `retry: > 0` on mutations.**
12. **No `refetchOnMount: false` without a comment explaining the staleTime tier.**
13. **No OpenAPI codegen tooling added to the repo.** (`openapi-typescript`, `kubb`, `orval`, etc.)
14. **No type without a `@source` docblock citing the serializer.**
15. **No re-implementation of `base64(JSON.stringify([...]))` or `encodeArrayToBase64` outside `src/sdk/core/`.**
16. **No raw `{ field_name, operator, value }` filter literal in consumer code.** The backend accepts this shape; the SDK hides it. Consumers use the typed `where: { ... }` builder.
17. **No mixing of hooks-layer and imperative-client imports in the same module.** Pages either use hooks or use the imperative client (in RSCs), never both.

---

## 17. How "done" is judged

The foundation phase is **complete** when:

1. The directory in §4 is fully implemented.
2. All five foundation namespaces (Auth, Tenants, Users, Courses, Attachments) ship with imperative client, hooks, keys, types, and tests passing.
3. `sdk.tenants.current()` resolves the correct tenant from the request Host on both server and client without an authenticated session (this is the prerequisite for MSAL login).
4. A user can log in via `sdk.auth.login(...)` or `sdk.auth.loginMicrosoft(...)` from the client (the latter reading MSAL config from `sdk.tenants.current()`), the SDK writes the `access` / `account` / `schema` cookies via `cookies-next`, and **both** a subsequent client-side `useUserMe()` AND a server-side `await sdk.users.me()` in an RSC return the authenticated user (the read path is dual; the write path is client-only — see §9.1).
5. The RSC litmus-test page in §14.3 renders with **zero client-side network requests on first paint** (verified in the browser devtools network panel).
6. The lint rule in §14.3 catches every lint-enforceable rule from §13 and §16 on a curated set of negative-example files (a `tests/lint-negative-examples/` folder of intentionally-bad code that the lint rule must flag).
7. The SDK README in §14.4 contains every recipe listed there, with at least one runnable example each.
8. A maintainer can pick any backend resource the agent did NOT implement (e.g., `subjects`, `categories`, `payment-methods`, `events`) and follow the "how to add a new resource" recipe in the README to ship it — typed, hooked, keyed, tested — in under 30 minutes without consulting the agent.

If the reviewer cannot do step 8 confidently, the SDK has missing pieces or the README is too thin, and the foundation needs another pass. The repeatability of adding a new resource is the deliverable, not just the existence of `src/sdk/`.


---

# PART D — Schedjuice v2 Data Table Brief (full text)

# Schedjuice v2 — Data Table Brief

> **Audience:** the AI agent building the new Schedjuice v2 data-table system.
> **Mode:** primitive-first. No application list pages built on top of this system until the foundation defined here is in place and reviewed.
> **Greenfield rule:** this table ships into a clean FE repo. No legacy `src/components/ui/data-table.tsx`, `data-table-pagination.tsx`, `data-table-search.tsx`, `data-table-view-options.tsx`, or `data-card.tsx` files exist; you are building from scratch. The patterns documented in §2 (Anti-positioning) describe the problems of the predecessor — they are constraints to design against, not code to migrate. You do not have read access to the legacy FE repo; everything you need is in this brief, the Design Brief (`2026-05-16-schedjuice-v2-design-brief.md`), and the SDK Brief (`2026-05-17-schedjuice-v2-api-sdk-brief.md`).

---

## 1. What you're building

A two-layer table system that renders every list-style surface in Schedjuice: courses, students, staff, invoices, payments, attendance, attempts, certificates, audits, and ~30 more. **One opinionated wrapper for the 80% case; one render-only primitive underneath.** Modules with advanced requirements (finance column reordering, admin reports with multi-sort) compose on top of the primitive directly.

The two layers:

1. **`<Table />`** — low-level render primitive. Built on `@tanstack/react-table`, but wrapped so consumers never import TanStack types. Pure render: takes columns + rows + table state, emits markup. No data fetching, no URL state, no toolbar, no pagination. Used directly by the rare module that needs full control.
2. **`<ResourceTable />`** — opinionated wrapper. Takes an SDK list-hook (`useCoursesList`, `useInvoicesList`, …), a typed `query`, a `columns` config, a `tableState` object, and renders the full list-page experience: toolbar with wildcard search and (optional) filter chips, sortable headers, paginated rows, empty/loading/error states. This is what 80% of list pages use.

There is also a companion `<ResourceCardList />` for surfaces where cards read better than rows (showcased course cards, kid-facing dashboards). It shares the same `listHook + query + tableState` contract — see §13.

You are not building application pages in this phase. But every API decision must survive contact with: an invoice table with 8 filter chips, a 500-row quiz-attempts table, a course list embedded inside a dialog, and a finance reconciliation table where the user reorders columns daily.

---

## 2. Anti-positioning — why this redesign exists

The predecessor `DataTable` (in the legacy repo you do not have access to) had six structural problems documented during a teardown. This brief is designed against each of them — they are constraints, not code you need to inspect:

1. **One 825-line component did everything.** Data fetching, URL state, search UI, pagination UI, view-mode toggle, CSV export, column visibility, selection, fullscreen, action column, card-view alternative — all in a single file with ~40 props. Adding a feature meant editing the do-everything component; every consumer paid the cost of every feature.
2. **Tightly coupled to a private fetch helper.** The table itself called `searchEntities(entity, query, filterParams)` and `makePostRequest(url, body, query)` internally. Consumers passed `entity="courses"` as a string and the table did the rest — no way to swap data sources, no way to use the table with an already-fetched list, no way to use it in an RSC.
3. **A per-field search sidebar nobody used.** Every column generated a search input in a collapsible sidebar. Maintained for years; the analytics never showed meaningful usage. Most users want one search box.
4. **Features that should have been per-table were global.** Selection, card-view toggle, CSV export, fullscreen, column visibility toggle — all on by default for every table, all controlled by boolean props. The default surface area was huge; the actual usage was concentrated in ~3 modules.
5. **Untyped column definitions.** `customColumnDef` extended TanStack's `ColumnDef` with `dataType`, `isSearchDisabled`, `isDefaultVisible`, `accessorKey` as a magic string — but the types leaked `any` through the whole stack. `// @ts-ignore` appeared throughout the component.
6. **URL state was inside the component, not the page.** `useQueryState("sort", …)`, `useQueryState("page", …)`, `useQueryState("search", …)` were hardcoded inside `DataTable`. Two tables on the same page collided on query keys; tables inside dialogs polluted the URL.

The new system eliminates each by construction. If a feature in this spec doesn't visibly kill at least one of the six, it doesn't belong in the foundation.

---

## 3. Architectural principles

These principles are not negotiable. Every design decision in §§4–13 follows from them.

1. **Two layers, hard boundary.** `<Table />` is render-only and state-agnostic. `<ResourceTable />` composes `<Table />` with SDK + toolbar + pagination. Nothing in `<Table />` knows about the SDK; nothing in `<ResourceTable />` reaches into TanStack internals.
2. **Controlled state is the default.** `<ResourceTable />` takes `{ tableState, onTableStateChange }` (bundled as one prop pair via the `useResourceTableState` hook). URL persistence is a hook concern, not a component concern. Local state and URL state are swapped by swapping the hook.
3. **The SDK is the data layer.** `<ResourceTable />` accepts a list-hook from `src/sdk/hooks/*` and a typed `query`. It does not fetch by itself, does not import axios, does not know about envelopes. The hook handles fetching, dehydration, abort plumbing, retries, error mapping.
4. **Features are opt-in, not opt-out.** Selection, CSV export, fullscreen, column visibility, card view — none exist as built-in toggleable props on `<ResourceTable />`. Tables that need them either compose at the page level (selection, export) or use a different primitive (cards). The default `<ResourceTable />` has zero props for features 80% of tables don't use.
5. **Typed columns. No `any`.** A single `Column<T>` type with full generic inference from the row type. No `accessorKey` strings that the compiler can't check. No `// @ts-ignore`. Maps to TanStack's `ColumnDef<T>` internally; consumers never import from `@tanstack/react-table`.
6. **Advanced lives elsewhere.** Column reordering, multi-sort, row virtualization, drag-resize — these are an `<AdvancedResourceTable />` extension (§12), not flags on the base. Modules opt in by importing a different component, not by setting `enableReordering={true}` on every table.
7. **Paper-like, not SaaS-like.** Every visual decision routes through the Design Brief (`2026-05-16-schedjuice-v2-design-brief.md`). Specifically: no shadcn, no Radix, no hard 1px borders where rough.js can carry meaning, no card-stacking, no icon-decoration on headers, small-caps Latin-only headers, 52px+ row height, paper-tone zebra striping, handwriting accent for empty/loading text.

---

## 4. File layout

```
src/components/data-table/
  table.tsx                  # <Table /> — render primitive (TanStack-backed, no state)
  resource-table.tsx         # <ResourceTable /> — opinionated wrapper (hook + query + columns + state)
  use-resource-table-state.ts# state hook (URL or local), namespaced
  use-table-instance.ts      # internal: builds the TanStack table from columns + state + data
  columns.ts                 # Column<T> public type + column-builder helpers (column.text, column.date, column.number, …)
  parts/
    toolbar.tsx              # <ResourceTable.Toolbar /> — search + filter chips + custom slot
    search-input.tsx         # wildcard search input
    filter-chips.tsx         # consumer-provided filter chip strip
    sortable-header.tsx      # header with click-to-sort + RoughUnderline
    pagination.tsx           # paper-styled numeric pagination
    empty-state.tsx          # handwriting "Nothing here yet." default; override slot
    loading-state.tsx        # handwriting "Loading…"
    error-state.tsx          # ApiError-aware ("Couldn't load. Try again.")
    row.tsx                  # <TableRow /> — zebra-aware, no hover-scale
    cell.tsx                 # <TableCell /> — alignment, padding, tabular-num opt-in
  advanced/
    advanced-resource-table.tsx# <AdvancedResourceTable /> — column reordering, multi-sort
    use-column-reordering.ts # extension hook (drag handles, persistence)
    use-multi-sort.ts        # multi-column sort state + UI
  card-list/
    resource-card-list.tsx   # <ResourceCardList /> — companion primitive
    card-grid.tsx            # responsive card grid
  index.ts                   # public exports: Table, ResourceTable, useResourceTableState, Column, column.*
```

The folder layout is **shallow on purpose**. Foundation ships everything in this tree. Advanced lives in `advanced/`; card list lives in `card-list/`. The agent does not create per-feature subdirectories.

---

## 5. The two layers

### 5.1 `<Table />` — render primitive

A pure render component. Takes columns, rows, and table state. Emits markup. No fetching, no URL state, no toolbar. Used directly only when a consumer needs full control (e.g., a custom dashboard widget).

```tsx
import { Table, type Column } from "@/components/data-table";

const columns: Column<Course>[] = [
  column.text({ id: "title", header: "Title", accessor: (c) => c.title }),
  column.text({ id: "category", header: "Category", accessor: (c) => c.category?.name ?? "—" }),
  column.date({ id: "start_date", header: "Start date", accessor: (c) => c.start_date }),
];

<Table
  columns={columns}
  rows={courses}
  state={{ sorting: [{ id: "start_date", desc: true }] }}
  onStateChange={setState}
/>;
```

Props:

```ts
type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  state?: TableState;                    // sorting; pinning is column-config-only at this layer
  onStateChange?: (state: TableState) => void;
  getRowId?: (row: T, index: number) => string;
  /** Empty/loading/error are render slots — consumer decides what shows.
   *  ResourceTable wires default paper-styled versions. */
  empty?: React.ReactNode;
  loading?: React.ReactNode;
  error?: React.ReactNode;
  /** Renders an opt-in trailing actions column. Receives the row, returns a node (typically a Menu). */
  rowActions?: (row: T) => React.ReactNode;
};

type TableState = {
  sorting: { id: string; desc: boolean }[];
};
```

Behavior:

- Renders nothing in the body when `loading`, `error`, or `empty` is non-null (those slots take over the body area, see §10).
- No data fetching, no URL state, no toolbar, no pagination. Consumer wires those at a layer above.
- Internally builds a `useReactTable` instance and renders it. The TanStack instance is not exposed.
- Honors `column.pinned` from the column config (config-only pinning; no runtime drag-to-pin).

### 5.2 `<ResourceTable />` — opinionated wrapper

The 80% case. Takes an SDK list-hook + query + columns + state, renders the full list-page experience.

```tsx
import { ResourceTable, useResourceTableState, column } from "@/components/data-table";
import { useCoursesList } from "@/sdk/hooks/courses";
import { courseFilters } from "@/sdk/resources/courses";

export default function CoursesListPage() {
  const tableState = useResourceTableState({ namespace: "courses" });

  return (
    <ResourceTable
      listHook={useCoursesList}
      query={{
        where: courseFilters.forUser(currentUser),
        expand: ["category", "subject"],
      }}
      columns={courseColumns}
      tableState={tableState}
      toolbar={{
        wildcardSearch: { fields: ["title", "code"], placeholder: "Search courses" },
        filterChips: [
          { id: "active", label: "Active only", apply: (w) => ({ ...w, is_active: true }) },
          { id: "this-term", label: "This term", apply: (w) => ({ ...w, start_date: { gte: termStart } }) },
        ],
      }}
      rowActions={(course) => <CourseRowMenu courseId={course.id} />}
    />
  );
}
```

Props:

```ts
type ResourceTableProps<T> = {
  /** The SDK list-hook for this resource. Must be a tanstack-query hook that returns
   *  { data, isLoading, isFetching, error, refetch } where data is ListResult<T>. */
  listHook: (query: ListQuery<T>) => UseListResult<T>;

  /** Typed query passed to the list-hook. Merged with sort/pagination from tableState. */
  query: Omit<ListQuery<T>, "page" | "size" | "sort">;

  columns: Column<T>[];

  /** From useResourceTableState(). Owns sort/pagination/search/filter-chip state. */
  tableState: ResourceTableState<T>;

  /** Toolbar content. Pass {} to render an empty toolbar (still reserves vertical rhythm).
   *  Omit entirely to render no toolbar. */
  toolbar?: ToolbarConfig<T>;

  /** Opt-in trailing actions column. Renders a small <Menu /> or a single <Button />. */
  rowActions?: (row: T) => React.ReactNode;

  /** Page size for pagination. Default 20. */
  pageSize?: number;

  /** Override the default empty / loading / error states. */
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
  errorState?: (err: ApiError) => React.ReactNode;

  /** Imperative escape hatch for the rare case (selection, etc.). Receives a small typed api:
   *  { getRows: () => T[], refetch: () => Promise<unknown> }. NOT the TanStack table instance —
   *  that stays internal. If you find yourself reaching for more than these two methods, the
   *  feature probably belongs in a page-level wrapper, not inside ResourceTable. */
  onReady?: (api: ResourceTableApi<T>) => void;
};

type ResourceTableApi<T> = {
  getRows: () => T[];
  refetch: () => Promise<unknown>;
};

type UseListResult<T> = {
  data: ListResult<T> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: ApiError | null;
  refetch: () => Promise<unknown>;
};
```

`ResourceTable` is **controlled**. It does not own URL state. It does not own search/sort/pagination state. All state lives in `tableState`; the component reads + writes through it. This is what makes it composable with the SDK's RSC dehydration pattern.

---

## 6. `useResourceTableState`

The state hook. Returns the controlled state object pages pass to `ResourceTable`. Hides whether state is URL-backed or local.

```ts
type UseResourceTableStateOptions = {
  /** Required if persist === "url". Prefixes all URL keys (e.g. ?courses.sort=...). */
  namespace?: string;
  /** Where state lives. Default "url". */
  persist?: "url" | "local";
  /** Initial sort. */
  defaultSort?: { id: string; desc: boolean }[];
  /** Initial wildcard search. */
  defaultSearch?: string;
  /** Initial active filter chip ids. */
  defaultFilters?: string[];
};

export function useResourceTableState<T>(
  options: UseResourceTableStateOptions = {},
): ResourceTableState<T>;

type ResourceTableState<T> = {
  sort: { id: string; desc: boolean }[];
  page: number;          // 1-indexed
  search: string;
  activeFilters: string[];

  setSort: (s: { id: string; desc: boolean }[]) => void;
  setPage: (p: number) => void;
  setSearch: (s: string) => void;
  toggleFilter: (id: string) => void;

  /** Resets sort + page + search + filters to defaults. Used by "Clear filters" empty-state action. */
  reset: () => void;
};
```

Defaults:

- `persist: "url"` is the default. Pages opting into local state pass `persist: "local"` explicitly.
- URL state uses `nuqs`. Keys are `${namespace}.sort`, `${namespace}.page`, `${namespace}.q`, `${namespace}.filters`. Two tables on one page MUST have different namespaces; the hook throws in dev if two `useResourceTableState({ namespace: "courses" })` calls mount in the same tree.
- `defaultSort`, `defaultSearch`, `defaultFilters` are NOT re-applied on URL change — they only seed the initial state.

Internally, `ResourceTable` reads `tableState.sort` + `tableState.page` + `tableState.search` + `tableState.activeFilters`, merges them into the `query` passed to `listHook`, and forwards `setSort` / `setPage` to the appropriate child components (sortable header, pagination). The component is a pure consumer of the state object.

---

## 7. Column definitions

A single `Column<T>` type with generic inference from the row. Column-builder helpers provide the common cell shapes (text, number, date, status, custom). Consumers never import from `@tanstack/react-table`.

```ts
type Column<T> = {
  /** Stable id. Used as the sort key and URL key. */
  id: string;

  /** Header text. Latin-only — see Design Brief §7 on Burmese + small-caps interaction.
   *  Use sentence-case English in the header; small-caps transform is applied by the cell layer. */
  header: string;

  /** Accessor. Receives the typed row, returns the value to display.
   *  For non-display purposes (sorting, exports), see `sortValue`. */
  accessor: (row: T) => React.ReactNode;

  /** Optional separate sort value. If omitted, sorting uses `accessor` output (string-compared). */
  sortValue?: (row: T) => string | number | Date;

  /** Is this column sortable? Default true. */
  sortable?: boolean;

  /** Column pinning. Config-only at the base layer. */
  pinned?: "left" | "right";

  /** Mobile-viewport behavior. See §11.4 on horizontal scroll. */
  mobile?: "show" | "hide";  // default "show"

  /** Render-time width hint. Default auto. Use sparingly. */
  width?: number | string;

  /** Cell-level styling overrides. */
  align?: "left" | "right" | "center";
  tabularNum?: boolean;  // forces Plex Mono tabular numbers; default false (true on number / date / currency columns built via the helpers)
};
```

### 7.1 Column-builder helpers

The 80% of cells are text, numbers, dates, status pills, and links. Helpers produce typed `Column<T>` objects with the right cell shape applied.

```ts
import { column } from "@/components/data-table";

const courseColumns: Column<Course>[] = [
  column.text({
    id: "title",
    header: "Title",
    accessor: (c) => c.title,
  }),
  column.text({
    id: "category",
    header: "Category",
    accessor: (c) => c.category?.name ?? "—",
  }),
  column.date({
    id: "start_date",
    header: "Start date",
    accessor: (c) => c.start_date,
  }),
  column.number({
    id: "student_count",
    header: "Students",
    accessor: (c) => c.student_count,
    align: "right",
  }),
  column.status({
    id: "status",
    header: "Status",
    accessor: (c) => c.is_active ? "active" : "archived",
    palette: { active: "data-green", archived: "circuit-board" },
  }),
  column.custom({
    id: "main_teacher",
    header: "Main teacher",
    accessor: (c) => c.main_teachers?.[0] ?? null,
    cell: (teacher) => teacher ? <TeacherPill teacher={teacher} /> : <span>—</span>,
  }),
];
```

Helpers cover: `column.text`, `column.number`, `column.date`, `column.status`, `column.currency` (Plex Mono + currency formatting), `column.custom` (escape hatch — caller writes the cell render). Each helper sets sensible `tabularNum` / `align` defaults.

### 7.2 Internal mapping to TanStack

`use-table-instance.ts` maps `Column<T>[]` → `ColumnDef<T>[]` and feeds them to `useReactTable`. This is the **only** file that imports from `@tanstack/react-table`. The mapping is one-way; consumers do not pass TanStack column defs through.

---

## 8. Toolbar composition

The toolbar is opt-in via the `toolbar` prop on `<ResourceTable />`. Omit it → no toolbar. Pass `{}` → empty toolbar that still reserves vertical rhythm (useful for consistency across views).

```ts
type ToolbarConfig<T> = {
  /** Wildcard search across one or more fields. Renders as a single input on the toolbar's left. */
  wildcardSearch?: {
    fields: (keyof T & string)[];
    placeholder?: string;
    /** Debounce in ms. Default 250. */
    debounceMs?: number;
  };

  /** Filter chips. Each chip is a toggle that applies/removes a where-clause modifier
   *  on the current query. Consumer defines them per-table. There is no per-field
   *  auto-generated filter sidebar. */
  filterChips?: FilterChip<T>[];

  /** A custom slot for page-specific actions ("Export CSV", "New course"). Rendered
   *  on the toolbar's right. Consumer is responsible for content and layout. */
  customSlot?: React.ReactNode;
};

type FilterChip<T> = {
  id: string;
  label: string;
  /** When the chip is active, this transforms the where-clause before the listHook is called. */
  apply: (where: WhereClause<T>) => WhereClause<T>;
};
```

Visual rules (per Design Brief §9, §11):

- Wildcard search uses the `Input` primitive (Base UI, foundation phase). No icon decoration inside the input.
- Filter chips use the `Toggle` shape (small, text-led, no icons). Active chips show a Terracotta-tinted background; inactive are bare. **No more than 5 chips on a single table** — beyond that, the page needs page-level filter UI, not a chip strip.
- The custom slot accepts arbitrary nodes. Common content: a single `<Button>New course</Button>`, an "Export CSV" button wired to `sdk.courses.exportCsv?.()`, etc. Do not add cleverness here.
- A "search-and-filter is active" pill appears between toolbar and table when `tableState.search || tableState.activeFilters.length > 0`, with a small "Clear" link that calls `tableState.reset()`.

---

## 9. Pagination — paper-styled

Classic numeric pagination, redesigned to feel like a paper margin annotation rather than a SaaS pagination component.

Visual rules:

- Sits below the table. Separated from the table body by a `<RoughDivider />` (one wobble, seed-cached).
- Renders: `[Prev]  1  2  3  …  12  [Next]`. Current page is rendered in Fraunces (serif) at `--text-lg`, with a `<RoughUnderline />` beneath it (single wobble). Non-current pages are in sans at `--text-base`, hover applies a quiet background tint.
- All numbers in `IBM Plex Mono` tabular-num.
- A right-aligned "Showing 1–20 of 247" label. The numbers in this label are also Plex Mono tabular-num. The label uses `--text-sm` and `--text-muted`.
- Page-size selector is **NOT** in the pagination. Default `pageSize=20` is configured at the `<ResourceTable pageSize={...} />` level; consumers who need a different size set it once at the page. Runtime page-size toggling is a banned default (re-fetches confuse users; rarely needed).
- "Prev" / "Next" are text-led. Disabled state uses `--text-muted` and `cursor: not-allowed`.
- When there's only one page, the pagination renders only the "Showing X of Y" label (no buttons, no numbers).

The `<Pagination />` component receives `{ page, totalPages, totalCount, pageSize, onPageChange }` and is reused by `<ResourceTable />` and `<ResourceCardList />`. It is exported, so a module that builds its own list surface on the bare `<Table />` can also use it.

---

## 10. Empty / loading / error states

All three are slot props on `<ResourceTable />`. The defaults are paper-styled:

### 10.1 Empty (default)

```tsx
<div className="py-16 text-center">
  <p className="font-hand text-2xl text-text-secondary">Nothing here yet.</p>
  {hasActiveFiltersOrSearch && (
    <button onClick={tableState.reset} className="mt-3 text-sm underline">
      Clear filters
    </button>
  )}
</div>
```

- "Nothing here yet." uses `Schedjuice Hand` (Caveat + Padauk). This is one of the 3–5 designated handwriting moments per surface (Design Brief §5.3).
- If `tableState.search || tableState.activeFilters.length > 0`, show a "Clear filters" affordance.
- Consumers override via `emptyState` prop when a richer empty state is warranted ("You haven't created any courses yet — [Create one]").

### 10.2 Loading (default)

```tsx
<div className="py-16 text-center">
  <p className="font-hand text-xl text-text-muted">Loading…</p>
</div>
```

- No spinner, no skeleton in foundation. Loading is a moment, and the page-level RSC prefetch (SDK Brief §12) means most first-paint cases don't show this state at all.
- Skeleton rows ship as a follow-up — define a `SkeletonRow` slot in the export but don't implement until a real consumer needs it.

### 10.3 Error (default)

```tsx
<div className="py-16 text-center">
  <p className="font-hand text-xl text-danger">Couldn't load.</p>
  <p className="text-sm text-text-muted mt-2">{err.message}</p>
  <button onClick={refetch} className="mt-3 text-sm underline">
    Try again.
  </button>
</div>
```

- Receives the `ApiError` from the list-hook (SDK Brief §8.3). For `err.code === "unauthorized"`, the SDK has already triggered the auth redirect; this state should never render for 401.
- For `err.code === "network"`, the message is "Couldn't load. Check your connection."
- For `err.code === "validation_error"`, the message uses `err.message` directly (validation on a list query is rare — typically a malformed filter).

---

## 11. Visual design rules (the paper part)

This section operationalizes the Design Brief for the table surface. Every rule here MUST be honored; deviations require approval before they ship.

### 11.1 Row chrome

- **No row borders.** Vertical rhythm comes from row padding (16px vertical inside a 52px-minimum row) and subtle zebra striping.
- **Zebra striping:** alternate rows between `--pixel-white` (`#FCF4E3`) and a 3% darker warm cream (defined as `--pixel-white-zebra` in the theme layer). Header is `--pixel-white`, never striped.
- **No vertical borders between columns.** Ever.
- **Row hover:** background shifts to a 4% Terminal tint (`color-mix(in srgb, var(--terminal) 4%, transparent)`). No scale, no shadow change, no border.
- **No `data-state="selected"` styling in the base.** Selection is composed at the page level; pages that need a selected-row style set it on their own data-attribute.

### 11.2 Header

- **Single header row.** No grouped headers, no spanning columns in foundation.
- **Small-caps Latin-only headers.** Use `font-feature-settings: "smcp"; text-transform: lowercase;` so Latin characters render as small caps while preserving the casing of Burmese (Design Brief §7). Header text is set in `Schedjuice Sans` at `--text-sm` with letter-spacing `0.05em`.
- **No uppercase transform.** Small-caps via OpenType only — never `text-transform: uppercase` (breaks Burmese shaping).
- **`<RoughUnderline />` beneath the header row.** Single wobble, seed-cached per table id. This is what separates header from body — no `border-bottom`.
- **No icons in headers.** Sort affordance is implicit (clicking the header label cycles sort state). Tooltip on hover reveals the sort hint.
- **Tabular-num columns** (number / date / currency / id) get `font-variant-numeric: tabular-nums` from the column helper.

### 11.3 Sort interaction

- Click the header label to cycle: `none → asc → desc → none`.
- Active-sort header label gets a `<RoughUnderline />` (different seed from the header divider so they don't visually merge).
- A tiny `↑` / `↓` glyph (text, not icon) appears after the label when sorted. No icon component, no Lucide.
- Multi-column sort is **not** supported in `<ResourceTable />`. It lives in `<AdvancedResourceTable />` (§12).

### 11.4 Responsive (horizontal scroll)

- On narrow viewports, the table scrolls horizontally inside its container. Outer page does not scroll horizontally.
- If a column is `pinned: "left"`, it stays put during horizontal scroll using sticky positioning.
- A subtle gradient mask on the scroll edges indicates more columns exist off-screen (paper-tone, not a hard shadow).
- Columns marked `mobile: "hide"` are visually hidden below the `sm` breakpoint (640px). They still occupy logical position in the column array, so re-showing them at a wider viewport is consistent.
- For surfaces where the user is primarily on a phone (chat lists, student attendance check-in), build a `<ResourceCardList />` instead of a `<ResourceTable />` (§13). Tables on phones are a fallback, not a target.

### 11.5 Density

- **One default density.** 52px minimum row height (matches Design Brief §9). Cell padding 16px vertical, 20px horizontal.
- Compact / comfortable variants are **not** in foundation. Add when a real consumer needs them.

---

## 12. `<AdvancedResourceTable />` extension

For modules with requirements the base intentionally doesn't carry. Lives in `src/components/data-table/advanced/`. **The base `<ResourceTable />` does not import from `advanced/`.** Modules opt in by importing a different component.

The extension adds, on top of `<ResourceTable />`:

- **Column reordering.** User-draggable column headers (drag handle = the header label itself). Reorder persists into `tableState` (and therefore the URL when `persist: "url"`).
- **Multi-column sort.** Shift-click adds a secondary sort. The active sort columns get numbered `<RoughUnderline />` annotations (1, 2, 3) so users can see the priority.
- **Column resize.** Drag the right edge of a header to resize. Widths persist into `tableState`.

What is NOT in `<AdvancedResourceTable />` in foundation (call out as follow-ups):

- Row virtualization (TanStack Virtual). Add when a consumer hits a real 1000+ row case.
- Column grouping / pivot.
- Inline editing.
- CSV export of reordered/filtered/sorted views (page-level concern even here).

```tsx
// Finance reconciliation example
import { AdvancedResourceTable, useResourceTableState } from "@/components/data-table/advanced";
import { useInvoicesList } from "@/sdk/hooks/invoices";

const tableState = useResourceTableState({
  namespace: "invoices",
  // advanced fields (columnOrder, columnWidths, multiSort) are merged in by AdvancedResourceTable
});

<AdvancedResourceTable
  listHook={useInvoicesList}
  query={{ where: { is_paid: false } }}
  columns={invoiceColumns}
  tableState={tableState}
  toolbar={{ wildcardSearch: { fields: ["invoice_number", "student__name"] } }}
/>;
```

`AdvancedResourceTable` shares 100% of `<ResourceTable />`'s prop surface. The extra capabilities are surfaced via a sibling hook, `useAdvancedResourceTableState`, that returns the base `ResourceTableState<T>` shape **plus** `columnOrder: string[]`, `columnWidths: Record<string, number>`, and `multiSort: { id: string; desc: boolean }[]` — with their own URL keys (`${namespace}.cols`, `${namespace}.widths`, `${namespace}.msort`). The returned object is structurally a superset of the base shape, so `<AdvancedResourceTable />` accepts it through the same `tableState` prop without a type widening. Pages opt in by swapping two imports — the hook and the component — and nothing else changes.

```ts
import { AdvancedResourceTable, useAdvancedResourceTableState } from "@/components/data-table/advanced";

const tableState = useAdvancedResourceTableState({ namespace: "invoices" });
// tableState satisfies ResourceTableState<Invoice> AND has columnOrder / columnWidths / multiSort.
```

`<ResourceTable />` accepts `ResourceTableState<T>` but will type-check fine if the consumer passes an `AdvancedResourceTableState<T>` (the superset). The base just ignores the advanced fields.

---

## 13. `<ResourceCardList />` companion

Same data contract as `<ResourceTable />`, different rendering surface. Used where cards read better than rows: showcased course catalog, kid-facing student dashboards, image-led surfaces.

```ts
type ResourceCardListProps<T> = {
  listHook: (query: ListQuery<T>) => UseListResult<T>;
  query: Omit<ListQuery<T>, "page" | "size" | "sort">;
  tableState: ResourceTableState<T>;
  cardRender: (row: T) => React.ReactNode;
  toolbar?: ToolbarConfig<T>;
  pageSize?: number;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
  errorState?: (err: ApiError) => React.ReactNode;
  /** Responsive grid columns. Default: { sm: 1, md: 2, lg: 3 }. */
  grid?: { sm?: number; md?: number; lg?: number; xl?: number };
};
```

`<ResourceCardList />` reuses `<Toolbar />`, `<Pagination />`, `<EmptyState />`, `<LoadingState />`, `<ErrorState />` from the table parts. The only thing it doesn't reuse is the row/header rendering — replaced by a grid of consumer-rendered cards.

There is **no `viewMode` toggle** that switches between table and card inside one component. The legacy pattern of `viewMode: "table" | "card"` with a dropdown is gone. Surfaces that genuinely benefit from both render the toggle at the page level and conditionally swap which primitive they mount. In practice, very few surfaces need this.

---

## 14. Foundation deliverables

The agent ships the following before any list page is built on top of the system. Everything here must be reviewed and approved before phase 2 (the FE's application surfaces — courses list, invoices list, students list — start landing).

### 14.1 Components

Everything in §4. Specifically:

- `<Table />` with full prop surface from §5.1, fully typed.
- `<ResourceTable />` with full prop surface from §5.2, fully typed.
- `useResourceTableState` from §6, supporting `persist: "url" | "local"`, namespace collision detection in dev. Plus `useAdvancedResourceTableState` from §12.
- `Column<T>` + the column-builder helpers (`column.text`, `column.number`, `column.date`, `column.status`, `column.currency`, `column.custom`).
- Toolbar + search + filter chips + pagination + sortable header + empty/loading/error states.
- `<AdvancedResourceTable />` with column reordering and multi-sort (column resize can be a follow-up if scope is tight; document explicitly which advanced features ship in foundation vs follow-up).
- `<ResourceCardList />` sharing the parts.

### 14.2 Showcase pages

Mounted under `/_design/data-table/` (not in production routing). The agent ships all four:

1. **`/_design/data-table/basic`** — `<ResourceTable />` with a mocked list-hook (returns fixture courses), wildcard search, no filter chips, no row actions. Demonstrates the 80% case.
2. **`/_design/data-table/full-toolbar`** — same as basic + 3 filter chips + a "New course" custom slot button + `rowActions` returning a `<Menu />`. Demonstrates the full toolbar surface.
3. **`/_design/data-table/advanced`** — `<AdvancedResourceTable />` with column reordering and multi-sort, with an invoices fixture. Demonstrates the advanced layer.
4. **`/_design/data-table/card-list`** — `<ResourceCardList />` with the same courses fixture, using a `cardRender` that produces a paper-styled course card. Demonstrates the cards companion.

Plus a **bilingual stress page** (`/_design/data-table/bilingual`) showing:

- A table with Burmese names in cells (e.g., a students table with `name: "အောင်ဇေယျ"`).
- A table with mixed-script values (`title: "Math 101 — အခြေခံသင်္ချာ"`).
- A header row that includes a Burmese-translated header (verifies small-caps doesn't break Burmese — should fall through to no-transform on Burmese chars).
- A filter chip with a Burmese label.
- An empty state with a Burmese-translated "Nothing here yet." in handwriting.

If any of these renders incorrectly — broken Burmese, layout collapse, contrast failures, focus rings invisible, header underline not rendering — the foundation is not done.

### 14.3 Tests

- **Unit tests (vitest)** for `useResourceTableState`: URL persistence, local persistence, namespace collision detection, reset, default seeding.
- **Unit tests** for the column-builder helpers: each helper produces a typed `Column<T>`, default `tabularNum` / `align` are correct.
- **Integration tests** (vitest + RTL) for `<ResourceTable />`: renders rows from a mocked list-hook; clicking a header cycles sort; typing in the search input updates `tableState` after debounce; clicking a filter chip toggles its active state; pagination updates `tableState.page`; empty / loading / error states render correctly.
- **Integration tests** for `<AdvancedResourceTable />`: drag-to-reorder updates `tableState.columnOrder`; shift-click adds to multi-sort.
- **Integration test** for `<ResourceCardList />`: renders cards from the same list-hook contract.
- **Accessibility tests**: keyboard navigation (Tab/Shift+Tab through headers and rows), header sort triggerable via keyboard, focus ring visible on all interactive elements (honors `--ring`).

### 14.4 Data-table README

`src/components/data-table/README.md` containing the recipes a future engineer (or agent) needs to wire a new list page without consulting this brief:

- **"How to wire a basic list page" recipe.** End-to-end: import the SDK hook + the table, define columns with the helpers, render `<ResourceTable />`. The courses showcase page is the worked example.
- **"How to add filter chips" recipe.** Define `apply: (where) => modifiedWhere`. Common patterns: boolean toggle (`is_active: true`), date range (`start_date: { gte: ... }`), enum filter (`status: { in: [...] }`).
- **"How to opt into advanced features" recipe.** Swap the import: `<ResourceTable>` → `<AdvancedResourceTable>`. Same prop surface; extra capabilities surface through `tableState`.
- **"How to use the table inside a dialog" recipe.** Use `useResourceTableState({ persist: "local" })` to keep URL clean.
- **"How to embed two tables on one page" recipe.** Different namespaces for each `useResourceTableState({ namespace })` call.
- **"How to write a custom empty state" recipe.** Pass `emptyState={...}` with a consumer-defined node, including a CTA when appropriate.
- **"What lives in the page, not the table" callout.** CSV export, selection, "new" buttons, page-level filters — these are consumer concerns. The table doesn't grow new props for them.

---

## 15. Banned list (hard rules)

In rough priority order. **#1 is the architectural anchor; do not negotiate.**

1. **No "do-everything" component.** `<ResourceTable />` does not grow new boolean feature props (`isSelectionEnabled`, `isCardViewEnabled`, `isFullscreenEnabled`, `isCsvExportable`, etc.). Features either compose at the page level or live in a sibling component.
2. **No shadcn UI.** Carries over from Design Brief §14.1. No `components.json`, no `pnpm dlx shadcn add`, no shadcn-derived class patterns. Table primitives compose on Base UI or are hand-written.
3. **No raw `@tanstack/react-table` imports outside `use-table-instance.ts`.** Consumers never see TanStack types. `Column<T>` is the public column type.
4. **No `any` in the table surface.** Including via `as any` casts. `unknown` is acceptable where the shape is genuinely unknown (the `customSlot` ToolbarConfig field is `React.ReactNode`, not `any`).
5. **No URL state inside the table component.** URL persistence is `useResourceTableState`'s job. The component reads + writes via the controlled props.
6. **No data fetching inside `<Table />` or `<ResourceTable />`.** `<ResourceTable />` calls the consumer-provided `listHook`; the hook owns the network. `<Table />` doesn't fetch at all.
7. **No per-field-of-every-column search sidebar.** The legacy pattern is gone. Filter chips are the explicit, per-table alternative; advanced filter UI is a page-level concern.
8. **No `viewMode: "table" | "card"` toggle inside one component.** Cards are a sibling primitive (`<ResourceCardList />`).
9. **No built-in CSV export, no built-in selection, no built-in fullscreen, no built-in column-visibility toggle in `<ResourceTable />`.** Each was in the legacy default; each is dropped. Add at the page level when actually needed.
10. **No row-level click handlers in the base.** No `rowHref`, no `onRowClick`. Row interactions live inside cells (a link cell, the opt-in `rowActions` menu).
11. **No icons in column headers, no icon decoration in toolbar inputs.** Carries over from Design Brief §11.
12. **No `text-transform: uppercase` on headers.** Use OpenType small-caps so Burmese is unaffected.
13. **No hard 1px borders for row separation or header divider.** Zebra striping + `<RoughUnderline />` for header. Carries over from Design Brief §8 / §14.4.
14. **No hover scale / hover shadow effects on rows.** Background tint only.
15. **No runtime page-size toggle.** Page size is a config prop set once per table.
16. **No multi-sort in the base.** Lives in `<AdvancedResourceTable />`.
17. **No `// @ts-ignore` or `// @ts-expect-error` in table code.** Fix the type. This is what killed the predecessor.

---

## 16. How "done" is judged

The foundation phase is **complete** when:

1. The file tree in §4 is fully implemented.
2. `<Table />`, `<ResourceTable />`, `<AdvancedResourceTable />`, and `<ResourceCardList />` are typed, tested, and rendering on the four `/_design/data-table/` showcase pages.
3. The bilingual stress page (`/_design/data-table/bilingual`) renders Burmese names, mixed-script titles, and Burmese headers without layout collapse or shaping defects.
4. A maintainer can pick any resource the agent did NOT wire (e.g., `students`, `payments`, `attendance-records`) and follow the README "How to wire a basic list page" recipe to ship a working list page in under 15 minutes without consulting the agent.
5. A reviewer can screenshot the showcase pages next to a vanilla shadcn admin table and immediately tell which one is Schedjuice — same litmus test as the design foundation.
6. No `<ResourceTable />` prop is a feature toggle. The component has props for *required configuration* (columns, listHook, query, tableState) and *render slots* (toolbar, rowActions, emptyState, loadingState, errorState). Nothing else.
7. The legacy do-everything 825-line shape is gone. Nobody on the team should be able to point at the new system and say "we just rewrote the old DataTable with new tokens."

If the reviewer can't do all seven, the table system has drifted toward the predecessor's shape, and the foundation needs another pass. The discipline of NOT growing the base is the deliverable.
