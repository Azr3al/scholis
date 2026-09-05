import { describe, expect, it } from "vitest";

import { planPaste } from "./smart-paste";

const fields = ["a", "b", "c"];

function editableAll() {
  return () => true;
}

describe("planPaste", () => {
  it("writes a block from the anchor", () => {
    const plan = planPaste({
      block: [["1", "2"], ["3", "4"]],
      fields,
      anchor: { row: 0, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 5,
      canGrow: false,
      isEditable: editableAll(),
    });
    expect(plan.writes).toEqual([
      { row: 0, field: "a", value: "1" },
      { row: 0, field: "b", value: "2" },
      { row: 1, field: "a", value: "3" },
      { row: 1, field: "b", value: "4" },
    ]);
    expect(plan.appendCount).toBe(0);
  });

  it("skips read-only columns without aborting", () => {
    const plan = planPaste({
      block: [["1", "2", "3"]],
      fields,
      anchor: { row: 0, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 1,
      canGrow: false,
      isEditable: (_row, field) => field !== "b",
    });
    expect(plan.writes).toEqual([
      { row: 0, field: "a", value: "1" },
      { row: 0, field: "c", value: "3" },
    ]);
  });

  it("clips overflow when growth is not allowed", () => {
    const plan = planPaste({
      block: [["1"], ["2"], ["3"]],
      fields,
      anchor: { row: 1, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 2,
      canGrow: false,
      isEditable: editableAll(),
    });
    expect(plan.writes).toEqual([{ row: 1, field: "a", value: "1" }]);
    expect(plan.appendCount).toBe(0);
  });

  it("appends rows for overflow when growth is allowed", () => {
    const plan = planPaste({
      block: [["1"], ["2"], ["3"]],
      fields,
      anchor: { row: 1, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 2,
      canGrow: true,
      isEditable: editableAll(),
    });
    expect(plan.appendCount).toBe(2);
    expect(plan.writes).toEqual([
      { row: 1, field: "a", value: "1" },
      { row: 2, field: "a", value: "2" },
      { row: 3, field: "a", value: "3" },
    ]);
  });

  it("fills a selection range from a single source cell", () => {
    const plan = planPaste({
      block: [["x"]],
      fields,
      anchor: { row: 0, col: 0 },
      selection: { rows: 2, cols: 2 },
      rowCount: 5,
      canGrow: false,
      isEditable: editableAll(),
    });
    expect(plan.writes).toEqual([
      { row: 0, field: "a", value: "x" },
      { row: 0, field: "b", value: "x" },
      { row: 1, field: "a", value: "x" },
      { row: 1, field: "b", value: "x" },
    ]);
  });
});
