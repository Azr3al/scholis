import { describe, expect, it } from "vitest";

import {
  remapSourceRowIndex,
  remapSourceRowIndices,
  remapValidationErrors,
} from "@/lib/imports/remap-source-rows";
import useImportStore from "@/store/import-store";

describe("remap-source-rows", () => {
  it("remaps index when removing rows above", () => {
    expect(remapSourceRowIndex(3, [0, 1])).toBe(1);
  });

  it("returns null when index was removed", () => {
    expect(remapSourceRowIndex(2, [1, 2, 4])).toBeNull();
  });

  it("remaps multiple indices", () => {
    expect(remapSourceRowIndices([0, 2, 4], [1])).toEqual([0, 1, 3]);
  });

  it("drops and remaps validation errors", () => {
    const errors = remapValidationErrors(
      [
        { sourceRow: 0, field: "name", reason: "bad", origin: "client" },
        { sourceRow: 2, field: "name", reason: "bad", origin: "server" },
        { sourceRow: 4, field: "email", reason: "bad", origin: "client" },
      ],
      [1, 2],
    );
    expect(errors).toEqual([
      { sourceRow: 0, field: "name", reason: "bad", origin: "client" },
      { sourceRow: 2, field: "email", reason: "bad", origin: "client" },
    ]);
  });
});

describe("import-store removeParsedRows", () => {
  it("removes rows, rowIds, and resolution entries", () => {
    useImportStore.getState().reset();
    useImportStore.setState({
      parse: {
        headers: ["Email"],
        rows: [["a@x.com"], ["b@x.com"], ["c@x.com"]],
        rowCount: 3,
        sheetNames: ["Sheet1"],
        activeSheet: "Sheet1",
      },
      rowIds: ["row-0", "row-1", "row-2"],
      resolution: new Map([
        ["row-0:email", { status: "new" }],
        ["row-1:email", { status: "linked", entityRef: { id: 1, label: "B" } }],
        ["row-2:email", { status: "new" }],
      ]),
    });

    useImportStore.getState().removeParsedRows([1]);

    const state = useImportStore.getState();
    expect(state.parse?.rows).toEqual([["a@x.com"], ["c@x.com"]]);
    expect(state.parse?.rowCount).toBe(2);
    expect(state.rowIds).toEqual(["row-0", "row-2"]);
    expect(state.resolution.has("row-1:email")).toBe(false);
    expect(state.resolution.has("row-0:email")).toBe(true);
    expect(state.resolution.has("row-2:email")).toBe(true);
  });

  it("refuses to remove all rows", () => {
    useImportStore.getState().reset();
    useImportStore.setState({
      parse: {
        headers: ["Email"],
        rows: [["a@x.com"]],
        rowCount: 1,
        sheetNames: ["Sheet1"],
        activeSheet: "Sheet1",
      },
      rowIds: ["row-0"],
    });

    useImportStore.getState().removeParsedRows([0]);

    expect(useImportStore.getState().parse?.rows).toHaveLength(1);
  });
});
