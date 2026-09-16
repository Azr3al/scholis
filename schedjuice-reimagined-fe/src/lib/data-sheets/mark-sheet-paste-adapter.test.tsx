import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMarkSheetPasteGrid } from "./mark-sheet-paste-adapter";

describe("useMarkSheetPasteGrid", () => {
  it("applyPasteFromText writes tab-separated values into the grid", () => {
    const { result } = renderHook(() => useMarkSheetPasteGrid(5, 5));

    act(() => {
      result.current.applyPasteFromText("Name\tScore\nAlice\t90", 0, 0);
    });

    expect(result.current.cells[0]).toEqual(["Name", "Score", "", "", ""]);
    expect(result.current.cells[1]).toEqual(["Alice", "90", "", "", ""]);
  });

  it("applyPasteFromText expands columns and rows for wide Excel blocks", () => {
    const { result } = renderHook(() => useMarkSheetPasteGrid(5, 5));
    const header = ["No.", "English name", "Reading Mark", "Reading Grade"].join("\t");
    const sub = ["", "", "Mark", "Grade"].join("\t");
    const row = ["1", "Paul", "53", "B"].join("\t");

    act(() => {
      result.current.applyPasteFromText(`${header}\n${sub}\n${row}`, 0, 0);
    });

    expect(result.current.cells[0]?.slice(0, 4)).toEqual([
      "No.",
      "English name",
      "Reading Mark",
      "Reading Grade",
    ]);
    expect(result.current.cells[2]?.slice(0, 4)).toEqual(["1", "Paul", "53", "B"]);
    expect(result.current.colCount).toBeGreaterThanOrEqual(4);
  });

  it("applyPasteFromText respects anchor row and column", () => {
    const { result } = renderHook(() => useMarkSheetPasteGrid(5, 5));

    act(() => {
      result.current.applyPasteFromText("B\tC", 1, 1);
    });

    expect(result.current.cells[0][0]).toBe("");
    expect(result.current.cells[1][1]).toBe("B");
    expect(result.current.cells[1][2]).toBe("C");
  });

  it("adapter setCellValue updates a single cell", async () => {
    const { result } = renderHook(() => useMarkSheetPasteGrid(3, 3));

    await act(async () => {
      result.current.adapter.setCellValue(0, "col-0", "hello");
      await Promise.resolve();
    });

    expect(result.current.cells[0][0]).toBe("hello");
  });
});
