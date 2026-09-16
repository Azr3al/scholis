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
