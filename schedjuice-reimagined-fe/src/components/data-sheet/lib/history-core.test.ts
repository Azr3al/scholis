import { describe, expect, it } from "vitest";

import {
  invertTransaction,
  pushTransaction,
  type HistoryState,
  type Transaction,
} from "./history-core";

const tx = (after: string): Transaction => ({
  label: "edit",
  cells: [{ row: 0, field: "a", before: "old", after }],
});

const empty: HistoryState = { undo: [], redo: [], limit: 3 };

describe("pushTransaction", () => {
  it("adds to the undo stack and clears redo", () => {
    const withRedo: HistoryState = { ...empty, redo: [tx("z")] };
    const next = pushTransaction(withRedo, tx("new"));
    expect(next.undo).toHaveLength(1);
    expect(next.redo).toHaveLength(0);
  });

  it("caps the undo stack at the limit", () => {
    let state = empty;
    state = pushTransaction(state, tx("1"));
    state = pushTransaction(state, tx("2"));
    state = pushTransaction(state, tx("3"));
    state = pushTransaction(state, tx("4"));
    expect(state.undo).toHaveLength(3);
    expect(state.undo[0].cells[0].after).toBe("2");
  });
});

describe("invertTransaction", () => {
  it("swaps before/after for cell changes", () => {
    const inverted = invertTransaction(tx("new"));
    expect(inverted.cells[0]).toEqual({ row: 0, field: "a", before: "new", after: "old" });
  });

  it("inverts append into remove and vice versa", () => {
    const append: Transaction = {
      label: "insert",
      cells: [],
      structural: [{ kind: "append", rows: [5] }],
    };
    const inverted = invertTransaction(append);
    expect(inverted.structural?.[0]).toEqual({ kind: "remove", rows: [5] });
  });
});
