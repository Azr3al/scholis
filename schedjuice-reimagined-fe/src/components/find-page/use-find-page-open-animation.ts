"use client";

import { useEffect, useRef, useState } from "react";
import { FIND_PAGE_METABALL } from "@/lib/sj/motion";

export type FindPagePhase = "idle" | "opening" | "open" | "closing";

/**
 * Phase machine for the find-page liquid sequence:
 * `idle → opening → open → closing → idle`. `skip` (reduced motion, hidden
 * dock, no WebGL) jumps straight between `idle` and `open`. Interrupts:
 * closing mid-`opening` goes straight to `idle` (no liquid close from a
 * half-formed dialog); reopening mid-`closing` restarts `opening`.
 *
 * Timers (not the shader's rAF) advance the phases so a throttled tab can
 * never strand the palette mid-animation. The handoff to `open` lands at
 * `openHandoff` of the timeline so the dialog crossfade overlaps the bloom.
 */
export function useFindPageOpenAnimation(
  open: boolean,
  skip: boolean,
): FindPagePhase {
  const [phase, setPhase] = useState<FindPagePhase>(open ? "open" : "idle");
  const prevOpenRef = useRef(open);

  // Reset during render on the open/closed flip so the first frame of a new
  // state never paints a stale phase (React re-renders before committing).
  if (open !== prevOpenRef.current) {
    prevOpenRef.current = open;
    if (open) {
      setPhase(skip ? "open" : "opening");
    } else {
      setPhase(skip || phase === "opening" ? "idle" : "closing");
    }
  }

  useEffect(() => {
    if (phase === "opening") {
      const t = setTimeout(
        () => setPhase("open"),
        FIND_PAGE_METABALL.openSec * FIND_PAGE_METABALL.openHandoff * 1000,
      );
      return () => clearTimeout(t);
    }
    if (phase === "closing") {
      const t = setTimeout(
        () => setPhase("idle"),
        FIND_PAGE_METABALL.closeSec * 1000,
      );
      return () => clearTimeout(t);
    }
  }, [phase]);

  return phase;
}
