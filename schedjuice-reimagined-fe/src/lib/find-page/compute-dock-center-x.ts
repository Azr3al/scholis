export type ComputeDockCenterXInput = {
  panelLeft: number;
  panelWidth: number;
  preferredCenterX: number;
  /** Viewport X where the left header cluster ends. */
  leftChromeRight: number;
  /** Viewport X where the right header cluster starts. */
  rightChromeLeft: number;
  notchWidth: number;
  /** Extra width reserved beside the notch (e.g. Tips link). 0 on compact/mobile. */
  tipsReserve: number;
  /** Small gutter between chrome and notch edges. */
  padding?: number;
};

/**
 * Clamps the Find Page dock center so the idle notch stays between measured
 * header chrome clusters. Prefers shifting left to protect right-side actions.
 */
export function computeDockCenterX(input: ComputeDockCenterXInput): number {
  const padding = input.padding ?? 8;
  const halfNotch = input.notchWidth / 2;
  const panelRight = input.panelLeft + input.panelWidth;

  const minCenterX = Math.max(
    input.panelLeft + halfNotch + padding,
    input.leftChromeRight + halfNotch + padding,
  );
  const maxCenterX = Math.min(
    panelRight - halfNotch - input.tipsReserve - padding,
    input.rightChromeLeft - halfNotch - input.tipsReserve - padding,
  );

  if (minCenterX > maxCenterX) {
    const panelMinCenter = input.panelLeft + halfNotch + padding;
    if (maxCenterX >= panelMinCenter) {
      return maxCenterX;
    }
    return minCenterX;
  }

  return Math.min(Math.max(input.preferredCenterX, minCenterX), maxCenterX);
}
