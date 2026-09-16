# Motion & sound contract

Motion is **paper-and-pencil physics** — soft, lightly springy, never slick. Most state changes are CSS transitions; use **Motion** (`motion/react`) only for orchestration (enter/exit, stagger, sequenced reveals).

## Source of truth

- **CSS:** [`src/app/globals.css`](../../../src/app/globals.css) — `.sj-root` duration/easing vars, e.g. `duration-[var(--duration-normal)] ease-[var(--ease-paper)]`
- **JS:** [`src/lib/sj/motion.ts`](../../../src/lib/sj/motion.ts) — `DURATION`, `EASE`, `STAGGER`, `transition`, and ready-made variants. **Import these — never hand-type easing arrays or durations.**

## Recipes (from `motion.ts`)

| Export | Use for |
| --- | --- |
| `crossfade` | Swap a region's contents (`AnimatePresence mode="wait"`) |
| `staggerList` + `staggerItem` | Panel/list children reveal in sequence (section rail) |
| `popIn` | Menus, popovers, dialogs (0.96→1 scale + fade). **Exception:** `Select` / `Combobox` listboxes are instant |
| `savedTick` | Transient autosave confirmation |
| `listItemPresence` | Single row mount/unmount on inclusion toggle — see [DVR case study](../case-studies/dvr-preview-field-presence.md) |
| `transition.railMorph` / `panelWipe` | Rail collapse / panel reveal; hold fixed inner width |

## Rules

- **Every new UI section enters with subtle motion** — fade + small transform (≤8px slide or 0.96→1 scale). Instant pop-in is a bug.
- **No layout shift from loading or async UI** — reserve space before content arrives. **Collapsing in-flow content** in `#main-content` requires scroll anchor restore — see [collapse case study](../case-studies/collapse-scroll-anchor.md).
- Animate **`transform` and `opacity`** where possible. Sanctioned layout animation: deliberate `width`/`height` morph (rail, accordion) with fixed inner content size.
- **Enter and exit:** wrap mount/unmount in `AnimatePresence`. Exception: Select/Combobox listboxes.
- **`prefers-reduced-motion`:** CSS tokens collapse durations in `.sj-root`; gate Motion with `useReducedMotion()` → opacity-only.
- **No layout-shift hovers** on tiles/stats/cards. `active:scale-[0.98]` on **buttons** only.

## Dialogs & overlays

**Prefer inline, in-flow UI over dialogs.**

| Pattern | Use for |
| --- | --- |
| Composer slot | Add/edit items in a list (panel above/below, same page flow) |
| Section edit mode | Multi-field groups on record pages |
| `revealBar` + `AnimatePresence` | Expanding inline form or action bar |

**Use dialogs / sheets / alert dialogs only when:** irreversible or major side effects, blocking confirmation that cannot fit inline, ephemeral pickers (date popover, combobox).

**Do not use centered modals for:** create/edit forms, file uploads, or workflows performed while browsing a record section.

Overlay popups use **`popIn`**. Primary form workflows use **`revealBar`** or **`crossfade`**.

## Sound

Implemented sidebar context clicks and theme toggle — synthesized **brown switch** via Web Audio API:

- Engine: [`src/lib/sound/click-sound.ts`](../../../src/lib/sound/click-sound.ts)
- Preferences: [`src/lib/sound/sound-preference.ts`](../../../src/lib/sound/sound-preference.ts) — keys `sj:ui-sounds`, `sj:ui-sounds-volume`
- **Latency budget:** 200ms — lazy `AudioContext` resume on first user gesture
