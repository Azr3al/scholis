// Schedjuice motion — the single source of truth for JS (Motion) animations.
// Mirrors the CSS motion tokens in globals.css (.sj-root). Keep the two in sync.
//
// WHY THIS FILE EXISTS: so every surface animates identically. Import these constants
// and variants — never hand-type easing arrays or durations in components. See docs/design/ui-contracts/motion.md.

import type { Transition, Variants } from "motion/react";

/** Durations in SECONDS (Motion uses seconds; CSS tokens are the same values in ms). */
export const DURATION = {
  fast: 0.12, //  --duration-fast  (120ms) — fades, hovers, tooltips, "Saved" ticks
  normal: 0.22, // --duration-normal (220ms) — content crossfades, most enter/exit
  slow: 0.36, //  --duration-slow  (360ms) — rail collapse, panel wipes, large moves
} as const;

type Cubic = [number, number, number, number];

/** Easing curves — paper-and-pencil physics (DESIGN.md §12). */
export const EASE = {
  /** Playful settle (slight overshoot) — entrances, the section-rail wipe. */
  paper: [0.34, 1.2, 0.64, 1] as Cubic,
  /** Calm in-out — toggles, size/color states. */
  quiet: [0.33, 0, 0.2, 1] as Cubic,
  /** Gentle deceleration — fades, collapses, content swaps. */
  outSoft: [0.22, 0.61, 0.36, 1] as Cubic,
} as const;

/** Sequence timing: let a container settle, then reveal its children one by one. */
export const STAGGER = {
  children: 0.05, // gap between each child
  delayChildren: 0.16, // wait before the first child
} as const;

/** Ready-made transitions — reference these instead of re-specifying duration+ease. */
export const transition = {
  railMorph: { duration: DURATION.slow, ease: EASE.outSoft }, // collapse/expand a rail
  panelWipe: { duration: DURATION.slow, ease: EASE.paper }, //   reveal a panel (width)
  crossfade: { duration: DURATION.normal, ease: EASE.outSoft }, // swap a region's content
  fadeFast: { duration: DURATION.fast, ease: EASE.outSoft }, //   quick opacity changes
} satisfies Record<string, Transition>;

/**
 * Find-page Dynamic Island layout morph — spring params from the web Dynamic Island reference.
 * Exception to paper/quiet easings; used only for shared layoutId size/position morphing.
 */
export const islandLayoutTransition: Transition = {
  layout: { type: "spring", duration: 0.3, stiffness: 110, damping: 12 },
};

/**
 * Find-page results extending below the search bar as the user types
 * (Spotlight/Dynamic Island). Exception to paper/quiet easings, like
 * {@link islandLayoutTransition}.
 */
export const findPageExtendTransition: Transition = {
  type: "spring",
  duration: 0.35,
  bounce: 0.15,
};

/**
 * Find-page liquid metaball sequence (WebGL SDF goo, find-page-metaball.tsx).
 * Open: the notch liquefies, a bead drips off and blooms into the search bar
 * while the leftover notch mass melts into the panel edge.
 * Close: the bar collapses to a bead sucked back up into a notch that
 * re-forms out of the edge to catch it.
 * The same durations drive the phase machine in use-find-page-open-animation,
 * so the visual and the state transitions can never drift apart. Beat fractions
 * within the timeline are shader choreography and live in the component
 * (exception to the token rule, like islandLayoutTransition).
 */
export const FIND_PAGE_METABALL = {
  /** Full open timeline (seconds). */
  openSec: 1.05,
  /** Fraction of openSec after which the real dialog starts its crossfade. */
  openHandoff: 0.86,
  /** Full close timeline (seconds). */
  closeSec: 0.5,
} as const;

/**
 * Crossfade a swapped region. Pair with `<AnimatePresence mode="wait">` and key the child
 * by the changing state (e.g. the active route/section).
 */
export const crossfade: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.crossfade },
  exit: { opacity: 0, y: -8, transition: transition.fadeFast },
};

/**
 * Opacity-only crossfade for heavy regions (large tables/lists). Same timing as
 * {@link crossfade} but avoids compositing a large subtree with transform.
 */
export const crossfadeOpacity: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.crossfade },
  exit: { opacity: 0, transition: transition.fadeFast },
};

/** Instant crossfade when reduced motion is preferred (DESIGN.md §12). */
export const crossfadeInstant: Variants = {
  initial: { opacity: 1 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 1, transition: { duration: 0 } },
};

/** Stagger container for a list/panel whose items should reveal in sequence. */
export const staggerList: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: STAGGER.children, delayChildren: STAGGER.delayChildren },
  },
  exit: {},
};

/** Each child inside {@link staggerList} — slides + fades in. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: DURATION.normal, ease: EASE.paper } },
  exit: { opacity: 0, x: -6, transition: transition.fadeFast },
};

/** Opacity-only stagger item — use on `<tr>` where transform is unreliable. */
export const staggerItemOpacity: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.normal, ease: EASE.paper } },
  exit: { opacity: 0, transition: transition.fadeFast },
};

/** Delay (seconds) for the nth staggered row (0-based). */
export function staggerRowDelay(index: number): number {
  return STAGGER.delayChildren + index * STAGGER.children;
}

/** Menus / popovers / dialogs — small scale + fade (matches the Base UI primitive popups). */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: transition.fadeFast },
  exit: { opacity: 0, scale: 0.96, transition: transition.fadeFast },
};

/** A contextual action bar that appears on a dirty/changed state. */
export const revealBar: Variants = {
  initial: { opacity: 0, height: 0, y: -4 },
  animate: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE.paper },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -4,
    transition: transition.fadeFast,
  },
};

/** Transient confirmation, e.g. an autosave "Saved ✓". */
export const savedTick: Variants = {
  initial: { opacity: 0, x: 6, scale: 0.94 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: DURATION.normal, ease: EASE.paper },
  },
  exit: {
    opacity: 0,
    x: 4,
    scale: 0.96,
    transition: transition.fadeFast,
  },
};

/**
 * Single list/form row that mounts and unmounts as the user toggles inclusion
 * (e.g. DVR create preview when checking fields in the catalog).
 * Pair with `<AnimatePresence mode="popLayout" initial={false}>` and stable keys;
 * enable `layout` on the motion node so neighbors reflow instead of jumping.
 * Exit is intentionally faster than enter (`fadeFast` vs `crossfade`).
 */
export const listItemPresence: Variants = {
  initial: { opacity: 0, y: -6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transition.crossfade,
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: transition.fadeFast,
  },
};

/** Opacity-only twin of {@link listItemPresence} for `prefers-reduced-motion`. */
export const listItemPresenceReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export function resolveListItemPresence(reduced: boolean | null): Variants {
  return reduced ? listItemPresenceReduced : listItemPresence;
}
