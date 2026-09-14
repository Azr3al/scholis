import { describe, expect, it } from "vitest";
import {
  selectValueClassName,
  selectPopupMaxHeightClassName,
  selectPopupClassName,
  selectPopupListClassName,
  selectPopupScrollArrowClassName,
  selectPopupItemTextClassName,
  comboboxPopupWidthClassName,
  selectPositionerProps,
} from "./select-layout";

describe("selectValueClassName", () => {
  it("left-aligns the selected label", () => {
    expect(selectValueClassName()).toContain("text-left");
  });
});

describe("selectPopupMaxHeightClassName", () => {
  it("caps height at 24rem and available height with vertical scroll", () => {
    const cls = selectPopupMaxHeightClassName();
    expect(cls).toContain("max-h-[min(24rem,var(--available-height))]");
    expect(cls).toContain("overflow-y-auto");
  });
});

describe("selectPopupClassName", () => {
  it("grows from trigger width up to available width as a relative shell", () => {
    const cls = selectPopupClassName();
    expect(cls).toContain("relative");
    expect(cls).toContain("min-w-[var(--anchor-width)]");
    expect(cls).toContain("max-w-[var(--available-width)]");
    expect(cls).not.toContain("overflow-y-auto");
  });

  it("uses themed focus outline instead of the browser default", () => {
    const cls = selectPopupClassName();
    expect(cls).toContain("outline-none");
    expect(cls).toContain("focus-visible:outline-[var(--ring)]");
  });
});

describe("selectPopupListClassName", () => {
  it("scrolls the option list within the shared height cap", () => {
    const cls = selectPopupListClassName();
    expect(cls).toContain("max-h-[min(24rem,var(--available-height))]");
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("outline-none");
  });
});

describe("selectPopupScrollArrowClassName", () => {
  it("pins up/down chevrons over the scrollable list", () => {
    expect(selectPopupScrollArrowClassName("up")).toContain("top-0");
    expect(selectPopupScrollArrowClassName("down")).toContain("bottom-0");
    expect(selectPopupScrollArrowClassName("up")).toContain("bg-surface-elevated");
  });
});

describe("selectPopupItemTextClassName", () => {
  it("allows truncation past the popup width cap", () => {
    const cls = selectPopupItemTextClassName();
    expect(cls).toContain("min-w-0");
    expect(cls).toContain("truncate");
    expect(cls).not.toContain("whitespace-nowrap");
  });
});

describe("comboboxPopupWidthClassName", () => {
  it("matches trigger width and caps at available width", () => {
    const cls = comboboxPopupWidthClassName();
    expect(cls).toContain("w-[var(--anchor-width)]");
    expect(cls).toContain("max-w-[var(--available-width)]");
  });
});

describe("selectPositionerProps", () => {
  it("uses fixed positioning so overflow ancestors do not clip the popup", () => {
    expect(selectPositionerProps().positionMethod).toBe("fixed");
  });

  it("measures collisions against an explicit viewport boundary", () => {
    const viewport = { nodeName: "HTML" } as Element;
    expect(selectPositionerProps(viewport).collisionBoundary).toBe(viewport);
  });

  it("omits collisionBoundary when no document or boundary is available", () => {
    expect(selectPositionerProps().collisionBoundary).toBeUndefined();
  });
});
