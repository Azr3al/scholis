import type { GridColumn } from "@glideapps/glide-data-grid";
import { describe, expect, it } from "vitest";

import { buildDisplayColumnLayout } from "./build-display-column-layout";

const columns: GridColumn[] = [
  { id: "b0_total", title: "Total", width: 56 },
  { id: "divide_0", title: "", width: 20 },
  { id: "b1_title", title: "Class (WE)", width: 200 },
  { id: "grand_total", title: "Total (WD+WE)", width: 72 },
];

describe("buildDisplayColumnLayout", () => {
  it("keeps fixed spacer columns between data segments regardless of layout order", () => {
    const layout = buildDisplayColumnLayout({
      columns,
      fieldByColumn: ["b0_total", null, "b1_title", "grand_total"],
      layoutOrder: ["b0_total", "b1_title", "grand_total", "divide_0"],
      hiddenFields: [],
      titleByField: new Map([
        ["b0_total", "Total"],
        ["b1_title", "Class (WE)"],
        ["grand_total", "Total (WD+WE)"],
      ]),
      defaultWidths: { b0_total: 56, b1_title: 200, grand_total: 72 },
      layoutWidths: {},
      sort: null,
      sortable: false,
    });

    expect(layout.colSourceIndex).toEqual([0, 1, 2, 3]);
    expect(layout.displayColumns.map((c) => c.id)).toEqual([
      "b0_total",
      "divide_0",
      "b1_title",
      "grand_total",
    ]);
    expect(layout.displayFields).toEqual([
      "b0_total",
      null,
      "b1_title",
      "grand_total",
    ]);
  });
});
