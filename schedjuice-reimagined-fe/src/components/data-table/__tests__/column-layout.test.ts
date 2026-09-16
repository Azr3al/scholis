import { describe, expect, it } from "vitest";

import {
  resolveColumnLayout,
  mergeColumnSizing,
  type ColumnLayoutModel,
} from "../column-layout";

describe("mergeColumnSizing", () => {
  it("applies explicit width overrides on top of role defaults", () => {
    const merged = mergeColumnSizing({
      role: "person",
      width: { min: "14rem" },
    });
    expect(merged.width.min).toBe("14rem");
    expect(merged.width.preferred).toBe("14rem");
    expect(merged.wrap).toBe("wrap");
  });
});

describe("resolveColumnLayout", () => {
  it("returns col style with min and preferred width for numeric role", () => {
    const layout: ColumnLayoutModel = resolveColumnLayout({
      role: "numeric",
    });
    expect(layout.colStyle).toEqual({
      minWidth: "7rem",
      width: "9rem",
      maxWidth: "12rem",
    });
    expect(layout.thClass).toContain("text-right");
    expect(layout.tdClass).toBe("tabular-nums");
    expect(layout.wrapClass).toContain("whitespace-nowrap");
  });

  it("caps max width when role defines max", () => {
    const layout = resolveColumnLayout({ role: "person" });
    expect(layout.colStyle.maxWidth).toBe("18rem");
    expect(layout.wrapClass).toContain("break-words");
  });

  it("control role never sets maxWidth so selects can grow in wide tables", () => {
    const layout = resolveColumnLayout({ role: "control" });
    expect(layout.colStyle.maxWidth).toBeUndefined();
    expect(layout.colStyle.minWidth).toBe("10rem");
  });

  it("leaves col min-width unset when sizing is undeclared", () => {
    const layout = resolveColumnLayout(undefined);
    expect(layout.colStyle).toEqual({});
    expect(layout.wrapClass).toBe("");
  });

});
