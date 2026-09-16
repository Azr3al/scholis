# Entity title + body (inline title)

Wherever a named entity's title sits above its content (course hub, create/edit shells, verification requests, similar record-style pages), use the **course-title pattern** — not a labeled full-width form input.

The title is the headline; fields and body content support it.

| Rule | Detail |
| --- | --- |
| **Typography** | Schedjuice Serif display — about `--text-2xl` (24px) on create/hub strips; page chrome H1 may sit smaller beside actions. Use `font-serif` / token stack from [`globals.css`](../../../src/app/globals.css). |
| **Width** | Short — `max-w-3xl` (or tighter). Never full-bleed like a settings form row. |
| **Resting state** | Plain text (button or equivalent), not a bordered input. Empty → muted placeholder (e.g. `Untitled course`, `untitled DVR`). Hover may show a quiet pencil affordance. |
| **Edit state** | Click (or keyboard activate) → bordered input, **autofocus**, same type size. **Enter** or **blur** commits display; **Escape** cancels without inventing a value. |
| **Label** | No separate `Name *` / `Title *` label — the title *is* the label. |
| **Empty vs default** | Placeholder text is **display-only** unless product explicitly sets a default string to submit. Create flows that require a name still validate empty on submit. |
| **Persistence** | Record pages may autosave on blur; create flows keep local state until Submit. Same visual pattern either way. |
| **Composition** | Title + actions sit in sticky or in-flow chrome; body below. Do **not** nest an extra elevated “paper” card inside the shell. |

## Sticky title chrome

When Back / page H1 / entity title / primary actions stick under scroll, use the shared helper — do not hand-roll a frosted inset bar:

- **Helper:** `entityTitleStickyChromeClassName()` — [`src/lib/layout/entity-title-chrome.ts`](../../../src/lib/layout/entity-title-chrome.ts)
- **Full-bleed:** negative margins cancel PageContainer's horizontal inset (`-mx-4` / `sm:-mx-6` / `lg:-mx-8`); matching positive `px-*` keep title content padded.
- **Surface:** `bg-surface-elevated/…` + light `backdrop-blur-sm` — same elevated cream as the app shell, **not** a cooler `bg-surface` slab.
- **No inset glass edge:** a sticky bar that only spans the content column creates an obvious vertical line beside the title. That is a bug.
- **Back + H1:** `entityTitleBackAlignClassName()` (`self-center`) and compact H1 (`leading-none`).

```
┌─ shell / PageContainer (inset) ─────────────────────────┐
│▓▓ sticky chrome full-bleed (surface-elevated + blur) ▓▓│
│▓  [Back] Page H1                    [⚙] [Submit]      ▓│
│▓  untitled entity (InlineEntityTitle)                 ▓│
│▓▓─────────────────────────────────────────────────────▓▓│
│     body content (preview / sections) …                 │
└─────────────────────────────────────────────────────────┘
```

## Shared controls

- **Create / non-autosave:** [`InlineEntityTitle`](../../../src/components/record/inline/inline-entity-title.tsx)
- **Record autosave (course hub today):** [`CourseRecordInlineText`](../../../src/components/course/record/course-record-inline-text.tsx) may remain until it wraps `InlineEntityTitle`; **new** surfaces must use `InlineEntityTitle`. Do not invent a third title widget.

**Do not:** stack a dense labeled `Input` for the entity name; use placeholder-as-only-affordance without a real edit mode; submit the placeholder string unless intentional; paint sticky chrome as an inset frosted rectangle with a visible vertical edge.
