export type FindPageAnchorPhase = "idle" | "opening" | "open" | "closing";

export type ResolveFindPageAnchorXInput = {
  phase: FindPageAnchorPhase;
  dockCenterX: number;
  panelCenterX: number;
  /** Mobile/compact: idle uses dockCenterX, open recenters on panel. Desktop: always panel center. */
  recenterOnOpen: boolean;
};

/**
 * Compact: idle/closing at collision-aware dockCenterX, opening/open at panel center.
 * Desktop: panel center for every phase (no horizontal shift on open).
 */
export function resolveFindPageAnchorX({
  phase,
  dockCenterX,
  panelCenterX,
  recenterOnOpen,
}: ResolveFindPageAnchorXInput): number {
  if (!recenterOnOpen) {
    return panelCenterX;
  }
  if (phase === "opening" || phase === "open") {
    return panelCenterX;
  }
  return dockCenterX;
}
