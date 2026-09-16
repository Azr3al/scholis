import { describe, expect, it } from "vitest";
import { computeDockCenterX } from "./compute-dock-center-x";

describe("computeDockCenterX", () => {
  const base = {
    panelLeft: 0,
    panelWidth: 800,
    preferredCenterX: 400,
    leftChromeRight: 200,
    rightChromeLeft: 600,
    notchWidth: 208,
    tipsReserve: 48,
    padding: 8,
  };

  it("keeps the dock centered on a wide panel with roomy header chrome", () => {
    expect(computeDockCenterX(base)).toBe(400);
  });

  it("shifts the dock left when the right header cluster crowds the center", () => {
    const centerX = computeDockCenterX({
      ...base,
      panelWidth: 390,
      preferredCenterX: 195,
      leftChromeRight: 120,
      rightChromeLeft: 230,
      tipsReserve: 0,
      notchWidth: 160,
    });

    expect(centerX).toBe(142);
  });

  it("clamps without throwing when the safe band is narrower than the notch", () => {
    const centerX = computeDockCenterX({
      ...base,
      panelWidth: 320,
      preferredCenterX: 160,
      leftChromeRight: 40,
      rightChromeLeft: 100,
      notchWidth: 208,
      tipsReserve: 0,
      padding: 8,
    });

    expect(Number.isFinite(centerX)).toBe(true);
    expect(centerX).toBe(152);
  });
});
