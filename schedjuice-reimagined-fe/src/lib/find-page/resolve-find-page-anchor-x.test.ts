import { describe, expect, it } from "vitest";
import { resolveFindPageAnchorX } from "./resolve-find-page-anchor-x";

describe("resolveFindPageAnchorX", () => {
  const dockCenterX = 142;
  const panelCenterX = 195;

  describe("compact (recenterOnOpen)", () => {
    const recenterOnOpen = true;

    it("uses dockCenterX when idle", () => {
      expect(
        resolveFindPageAnchorX({
          phase: "idle",
          dockCenterX,
          panelCenterX,
          recenterOnOpen,
        }),
      ).toBe(142);
    });

    it("uses panelCenterX when opening", () => {
      expect(
        resolveFindPageAnchorX({
          phase: "opening",
          dockCenterX,
          panelCenterX,
          recenterOnOpen,
        }),
      ).toBe(195);
    });

    it("uses panelCenterX when open", () => {
      expect(
        resolveFindPageAnchorX({
          phase: "open",
          dockCenterX,
          panelCenterX,
          recenterOnOpen,
        }),
      ).toBe(195);
    });

    it("uses dockCenterX when closing", () => {
      expect(
        resolveFindPageAnchorX({
          phase: "closing",
          dockCenterX,
          panelCenterX,
          recenterOnOpen,
        }),
      ).toBe(142);
    });
  });

  describe("desktop (!recenterOnOpen)", () => {
    const recenterOnOpen = false;

    it("keeps panelCenterX for every phase", () => {
      for (const phase of ["idle", "opening", "open", "closing"] as const) {
        expect(
          resolveFindPageAnchorX({
            phase,
            dockCenterX,
            panelCenterX,
            recenterOnOpen,
          }),
        ).toBe(195);
      }
    });
  });
});
