// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { columnResizeStorageKey } from "../column-resize-storage";
import {
  clearSorts,
  cycleColumnSorts,
  descriptorsToSorts,
  setColumnSortAsc,
  setColumnSortDesc,
  sortsToDescriptors,
  useTableInstance,
} from "../use-table-instance";

type Row = { id: string; name: string };

describe("sorts ↔ descriptors", () => {
  it("parses ascending and descending sort strings", () => {
    expect(sortsToDescriptors(["name", "-created_at"])).toEqual([
      { id: "name", desc: false },
      { id: "created_at", desc: true },
    ]);
  });

  it("serializes descriptors back to sorts strings", () => {
    expect(
      descriptorsToSorts([
        { id: "name", desc: false },
        { id: "created_at", desc: true },
      ]),
    ).toEqual(["name", "-created_at"]);
  });

  it("handles empty sorts", () => {
    expect(sortsToDescriptors([])).toEqual([]);
    expect(sortsToDescriptors()).toEqual([]);
    expect(descriptorsToSorts([])).toEqual([]);
  });
});

describe("cycleColumnSorts", () => {
  it("cycles none → asc → desc → none", () => {
    expect(cycleColumnSorts([], "name")).toEqual(["name"]);
    expect(cycleColumnSorts(["name"], "name")).toEqual(["-name"]);
    expect(cycleColumnSorts(["-name"], "name")).toEqual([]);
  });

  it("switches column when a different id is clicked", () => {
    expect(cycleColumnSorts(["-created_at"], "name")).toEqual(["name"]);
  });
});

describe("explicit column sort setters", () => {
  it("sets ascending, descending, and clear", () => {
    expect(setColumnSortAsc("name")).toEqual(["name"]);
    expect(setColumnSortDesc("name")).toEqual(["-name"]);
    expect(clearSorts()).toEqual([]);
  });
});

describe("useTableInstance layout meta", () => {
  it("threads resolved layout classes into header and body cells", () => {
    const { result } = renderHook(() =>
      useTableInstance({
        columns: [
          {
            id: "name",
            header: "Name",
            accessor: (row: Row) => row.name,
            sizing: { role: "person" },
          },
        ],
        rows: [{ id: "1", name: "Ada" }],
        getRowId: (row) => row.id,
      }),
    );
    expect(result.current.headerGroups[0].headers[0].layoutClass).toContain(
      "text-left",
    );
    expect(result.current.bodyRows[0].cells[0].layoutClass).toContain(
      "break-words",
    );
    expect(result.current.bodyRows[0].cells[0].layoutClass).not.toMatch(
      /text-left.*text-left/,
    );
    expect(result.current.columnLayouts[0].colStyle.minWidth).toBe("12rem");
  });

  it("omits col min-width when sizing is undeclared", () => {
    const { result } = renderHook(() =>
      useTableInstance({
        columns: [
          {
            id: "course",
            header: "Course",
            accessor: (row: Row) => row.name,
          },
        ],
        rows: [{ id: "1", name: "Algebra" }],
        getRowId: (row) => row.id,
      }),
    );
    expect(result.current.columnLayouts[0].colStyle.minWidth).toBeUndefined();
  });

  it("exposes resize handlers and pixel widths when resizing is enabled", () => {
    const { result } = renderHook(() =>
      useTableInstance({
        enableColumnResizing: true,
        columns: [
          {
            id: "amount",
            header: "Amount",
            accessor: (row: Row) => row.name,
            sizing: { role: "numeric", width: { min: "7rem", preferred: "9rem" } },
          },
        ],
        rows: [{ id: "1", name: "Ada" }],
        getRowId: (row) => row.id,
      }),
    );
    const header = result.current.headerGroups[0].headers[0];
    expect(header.pixelWidth).toBe(144);
    expect(header.getResizeHandler).toBeTypeOf("function");
    expect(result.current.columnLayouts[0].colStyle.width).toBe("144px");
  });

  it("computes cumulative sticky-left offsets for pinned columns", () => {
    const { result } = renderHook(() =>
      useTableInstance({
        enableColumnResizing: true,
        columns: [
          {
            id: "serial",
            header: "No.",
            accessor: (row: Row) => row.id,
            sizing: {
              role: "identifier",
              width: { min: "3rem", preferred: "3rem" },
              sticky: "left",
            },
          },
          {
            id: "name",
            header: "Student",
            accessor: (row: Row) => row.name,
            sizing: {
              role: "person",
              width: { min: "12rem", preferred: "14rem" },
              sticky: "left",
            },
          },
        ],
        rows: [{ id: "1", name: "Ada" }],
        getRowId: (row) => row.id,
      }),
    );
    const headers = result.current.headerGroups[0].headers;
    expect(headers[0].stickyLeft).toBe(0);
    expect(headers[0].isLastStickyLeft).toBe(false);
    expect(headers[1].stickyLeft).toBe(48);
    expect(headers[1].isLastStickyLeft).toBe(true);
    expect(result.current.bodyRows[0].cells[1].stickyLeft).toBe(48);
  });

  it("does not cap resize maxSize from role defaults when no explicit width.max", async () => {
    const storageKey = "test-no-role-max";
    localStorage.setItem(
      columnResizeStorageKey(storageKey),
      JSON.stringify({ amount: 300 }),
    );

    const { result } = renderHook(() =>
      useTableInstance({
        enableColumnResizing: true,
        columnResizeStorageKey: storageKey,
        columns: [
          {
            id: "amount",
            header: "Amount",
            accessor: (row: Row) => row.name,
            sizing: { role: "numeric" },
          },
        ],
        rows: [{ id: "1", name: "Ada" }],
        getRowId: (row) => row.id,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.headerGroups[0].headers[0].pixelWidth).toBe(300);
    localStorage.removeItem(columnResizeStorageKey(storageKey));
  });

  it("hydrates column widths from localStorage when storage key is provided", async () => {
    const storageKey = "test-hydrate-widths";
    localStorage.setItem(
      columnResizeStorageKey(storageKey),
      JSON.stringify({ amount: 200 }),
    );

    const { result } = renderHook(() =>
      useTableInstance({
        enableColumnResizing: true,
        columnResizeStorageKey: storageKey,
        columns: [
          {
            id: "amount",
            header: "Amount",
            accessor: (row: Row) => row.name,
            sizing: { role: "numeric", width: { min: "7rem", preferred: "9rem" } },
          },
        ],
        rows: [{ id: "1", name: "Ada" }],
        getRowId: (row) => row.id,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.headerGroups[0].headers[0].pixelWidth).toBe(200);
    localStorage.removeItem(columnResizeStorageKey(storageKey));
  });
});
