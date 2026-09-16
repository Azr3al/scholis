# Case study: Ma composition on Today (`/home`)

> **Superseded (2026-09-07):** `/home` is now an [orientation surface](../../../../docs/superpowers/specs/2026-09-07-home-orientation-design.md) (datetime, schedule, facts, workspaces). The Today queue components were removed. Typography patterns below (`.sj-stop`, `.sj-lede`, `.sj-dateline`, `border-rule`) still apply.

**Surface (historical):** `TodayQueue` on `/home`, replacing the sixteen-widget dashboard grid.

**Reference:** Japanese display typography (Total War: Three Kingdoms title cards and similar). The airiness of those layouts is **inherited from the writing system, not composed**:

- Em-square glyphs give a ragless rectangle for free.
- `。` occupies a full em box and leaves roughly two-thirds of it empty.
- No word spaces means lines break on meaning rather than on fit.

**The problem:** the reference's best property is the one thing Latin cannot inherit. Every one of those three effects has to be manufactured, or the surface just looks like a sparse list.

---

## The three substitutions

| Japanese gets for free | Latin has to manufacture |
| --- | --- |
| Half-empty punctuation box | `.sj-stop` — literal `padding-right: 0.5em` on the trailing period |
| Lines that break on meaning | `.sj-lede` — one authored clause per `<span>`, each `display: block` |
| Ragless rectangle from em-square glyphs | `text-wrap: balance` as the fallback when a clause overflows the measure |

Leading is **reduced** from the reference rather than copied: Latin ascenders already supply vertical air, so `.sj-display` sits at 1.14 where the reference would sit higher. Mono (`--font-mono`) takes katakana's job of signalling a different class of word — clocks, counts, bucket labels.

Justified text was considered and rejected. It trades ragging for uneven word spaces, which is a worse deal at display size.

---

## Why the breaks are structural, not decorative

Hard-set breaks look like a typographic flourish. They are load-bearing, and two product decisions fall out of them:

**1. The measure must be stable, not wide.** The page uses `PageContainer width="narrow"` (768px). Every extra hundred pixels re-rags the lede. This is also why the queue lives inside the existing sidebar rather than replacing it — the composition needs a predictable measure, and a fixed sidebar provides one.

**2. Nav must overlay, never push.** Any chrome that pushes content re-rags every line the moment someone opens a menu. The current `SidebarRail` collapses in place rather than reflowing the panel, which satisfies this. **A push-style nav would break this surface** — that constraint is the reason this note exists.

The lede is generated, not written: [`composeQueueLede`](../../../src/lib/today-queue/compose-queue-lede.ts) emits one sentence per non-empty bucket, so the break points are authored upstream even though the content is dynamic.

---

## Accent

The queue's settled rows carry **no colour**. The day's seal ([`DaySeal`](../../../src/components/home/day-seal.tsx)) is an unfilled outline all day and stamps `--brand` when the last row clears.

Marking every settled row green would spend the accent on "an event happened." Spending it once, late, makes it mean one thing: the day is closed. This is the concrete case behind the **one accent *meaning* per surface** rule in [DESIGN.md §5](../../../DESIGN.md).

The stamp is reserved for work that is **bounded, verifiable, and someone's responsibility** — not progress, not activity. [`QUEUE_ELIGIBLE_KINDS`](../../../src/lib/today-queue/eligible-kinds.ts) encodes that test: informational kinds (`today_schedule`, `admin_today_overview`, `class_starting_soon`) stay in the notification bell.

---

## Do

- Mount [`InkBleedDefs`](../../../src/components/primitives/decoration/ink-bleed.tsx) once per surface using `.sj-ink-act` or `.sj-ink-dot`.
- Set `data-script="myanmar"` on `.sj-display` via [`containsMyanmar`](../../../src/lib/sj/script.ts) whenever the string can hold user content.
- Collapse the mono clock column entirely when no row has a time, rather than filling it with em dashes.
- Omit bucket headers when only one bucket has rows — the lede already narrates the grouping.

## Don't

- Widen the measure "to use the space." The whitespace is the composition.
- Add a push-style nav, a second accent meaning, or card backgrounds behind the rows.
- Animate `feTurbulence` parameters. Scale the filtered shape instead (DESIGN.md §8).
- Let a row into the queue that the reader cannot finish. Rows with an unresolvable `href` are dropped for exactly this reason.
