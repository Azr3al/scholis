import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { GridCellKind } from "@glideapps/glide-data-grid";

import { inferImportColumns } from "@/lib/mark-sheets/mark-sheet-import-inference";
import { kindToDefaultColumnMapRole } from "@/lib/mark-sheets/column-map-role";

const dataSheetSpy = vi.fn();
const matchPopoverSpy = vi.fn();

vi.mock("@/components/data-sheet/data-sheet", () => ({
  DataSheet: (props: {
    menus?: { roleLabel?: string };
    headerSlot?: ReactNode;
    gridProps?: {
      headerHeight?: number;
      cellActivationBehavior?: string;
      onCellClicked?: (cell: [number, number], event?: { bounds: { x: number; y: number; width: number; height: number } }) => void;
      onCellActivated?: (
        cell: [number, number],
        bounds: { x: number; y: number; width: number; height: number } | null,
      ) => void;
    };
    children?: ReactNode;
  }) => {
    dataSheetSpy(props);
    if (!props.menus?.roleLabel) {
      throw new Error("menus.roleLabel is required");
    }
    return (
      <div data-testid="data-sheet">
        {props.headerSlot}
      </div>
    );
  },
}));

vi.mock("@/components/mark-sheets/mark-sheet-student-match-popover", () => ({
  MarkSheetStudentMatchPopover: (props: { target: unknown }) => {
    matchPopoverSpy(props.target);
    return props.target ? <div data-testid="match-popover-open" /> : null;
  },
}));

import { MarkSheetImportGrid } from "@/components/mark-sheets/mark-sheet-import-grid";

const FIXTURE_HEADERS = [
  "No.",
  "English name",
  "Reading and UoE(81M)",
  "R&W Grade",
];
const FIXTURE_ROWS = [["1", "Paul", "53", "B"]];

function buildFixtureState() {
  const { columns, columnMapping, warnings } = inferImportColumns(
    FIXTURE_HEADERS,
    FIXTURE_ROWS,
  );
  const columnRoles: Record<number, string> = {};
  columns.forEach((col, idx) => {
    columnRoles[idx] = kindToDefaultColumnMapRole(col.kind, columnMapping, idx);
  });
  return { columns, columnMapping, warnings, columnRoles };
}

describe("MarkSheetImportGrid", () => {
  afterEach(() => {
    cleanup();
    dataSheetSpy.mockClear();
    matchPopoverSpy.mockClear();
  });

  it("mounts review UI with headerSlot and hidden grid header", () => {
    const { columns, columnMapping, warnings, columnRoles } = buildFixtureState();

    render(
      <MarkSheetImportGrid
        headers={FIXTURE_HEADERS}
        rows={FIXTURE_ROWS}
        columns={columns}
        columnMapping={columnMapping}
        columnRoles={columnRoles as Record<number, import("@/lib/mark-sheets/column-map-role").ColumnMapRole>}
        resolution={new Map()}
        rowIds={["row-0"]}
        rosterStudents={[]}
        warnings={warnings}
        height={400}
        onColumnRoleChange={() => {}}
        onMaxMarksChange={() => {}}
        onResolutionChange={() => {}}
      />,
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(FIXTURE_HEADERS.length);
    expect(screen.getByTestId("selector-track")).toBeTruthy();
    expect(screen.getByTestId("data-sheet")).toBeTruthy();
    expect(dataSheetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        menus: { roleLabel: "Mark sheet import" },
        headerSlot: expect.anything(),
        gridProps: expect.objectContaining({ headerHeight: 0 }),
      }),
    );
  });

  it("shows warning banner when warnings are present", () => {
    const { columns, columnMapping, columnRoles } = buildFixtureState();
    const warnings = ["Section max marks sum to 81 but grand total header says 173."];

    render(
      <MarkSheetImportGrid
        headers={FIXTURE_HEADERS}
        rows={FIXTURE_ROWS}
        columns={columns}
        columnMapping={columnMapping}
        columnRoles={columnRoles as Record<number, import("@/lib/mark-sheets/column-map-role").ColumnMapRole>}
        resolution={new Map()}
        rowIds={["row-0"]}
        rosterStudents={[]}
        warnings={warnings}
        height={400}
        onColumnRoleChange={() => {}}
        onMaxMarksChange={() => {}}
        onResolutionChange={() => {}}
      />,
    );

    expect(screen.getByText(warnings[0]!)).toBeTruthy();
  });

  it("handles stringified column_mapping indices without throwing", () => {
    const { columns, warnings } = inferImportColumns(FIXTURE_HEADERS, FIXTURE_ROWS);
    const stringMapping = { name: "1", no: "0" };
    const columnRoles: Record<number, string> = {};
    columns.forEach((col, idx) => {
      columnRoles[idx] = kindToDefaultColumnMapRole(col.kind, stringMapping, idx);
    });

    expect(() =>
      render(
        <MarkSheetImportGrid
          headers={FIXTURE_HEADERS}
          rows={FIXTURE_ROWS}
          columns={columns}
          columnMapping={stringMapping as unknown as Record<string, number>}
          columnRoles={columnRoles as Record<number, import("@/lib/mark-sheets/column-map-role").ColumnMapRole>}
          resolution={new Map()}
          rowIds={["row-0"]}
          rosterStudents={[]}
          warnings={warnings}
          height={400}
          onColumnRoleChange={() => {}}
          onMaxMarksChange={() => {}}
          onResolutionChange={() => {}}
        />,
      ),
    ).not.toThrow();

    expect(screen.getAllByRole("combobox")).toHaveLength(FIXTURE_HEADERS.length);
  });

  it("mounts many column role selects without throwing", () => {
    const headers = Array.from({ length: 24 }, (_, i) => `Col ${i + 1}`);
    const rows = [headers.map((_, i) => String(i + 1))];
    const { columns, columnMapping, warnings } = inferImportColumns(headers, rows);
    const columnRoles: Record<number, string> = {};
    columns.forEach((col, idx) => {
      columnRoles[idx] = kindToDefaultColumnMapRole(col.kind, columnMapping, idx);
    });

    expect(() =>
      render(
        <MarkSheetImportGrid
          headers={headers}
          rows={rows}
          columns={columns}
          columnMapping={columnMapping}
          columnRoles={columnRoles as Record<number, import("@/lib/mark-sheets/column-map-role").ColumnMapRole>}
          resolution={new Map()}
          rowIds={["row-0"]}
          rosterStudents={[]}
          warnings={warnings}
          height={400}
          onColumnRoleChange={() => {}}
          onMaxMarksChange={() => {}}
          onResolutionChange={() => {}}
        />,
      ),
    ).not.toThrow();

    expect(screen.getAllByRole("combobox")).toHaveLength(headers.length);
  });

  it("ignored column role renders plain text even when mapping still lists email", () => {
    const headers = ["English name", "Email", "Score"];
    const rows = [["Hla Hla", "hlahla@hlahla.com", "55"]];
    const columns = headers.map((title, idx) => ({
      key: `col-${idx}`,
      title,
      kind: idx === 2 ? ("score" as const) : ("identifier" as const),
      sort_order: idx,
    }));
    const columnMapping = { name: 0, email: 1 };
    const columnRoles = {
      0: "name" as const,
      1: "ignore" as const,
      2: "score" as const,
    };

    render(
      <MarkSheetImportGrid
        headers={headers}
        rows={rows}
        columns={columns}
        columnMapping={columnMapping}
        columnRoles={columnRoles}
        resolution={new Map()}
        rowIds={["row-0"]}
        rosterStudents={[]}
        warnings={[]}
        height={400}
        onColumnRoleChange={() => {}}
        onMaxMarksChange={() => {}}
        onResolutionChange={() => {}}
      />,
    );

    const getCellContent = dataSheetSpy.mock.calls[0]?.[0]?.getCellContent;
    expect(getCellContent).toBeTypeOf("function");
    const emailCell = getCellContent!([1, 0]);
    expect(emailCell.kind).toBe(GridCellKind.Text);
    const nameCell = getCellContent!([0, 0]);
    expect(nameCell.kind).toBe(GridCellKind.Custom);
  });

  it("user-link cells with resolving status use shimmer renderer path", () => {
    const headers = ["English name", "Score"];
    const rows = [["Hla Hla", "55"]];
    const columns = headers.map((title, idx) => ({
      key: `col-${idx}`,
      title,
      kind: idx === 1 ? ("score" as const) : ("identifier" as const),
      sort_order: idx,
    }));
    const resolution = new Map([
      ["row-0:name", { status: "resolving" as const }],
    ]);

    render(
      <MarkSheetImportGrid
        headers={headers}
        rows={rows}
        columns={columns}
        columnMapping={{ name: 0 }}
        columnRoles={{ 0: "name", 1: "score" }}
        resolution={resolution}
        rowIds={["row-0"]}
        rosterStudents={[]}
        warnings={[]}
        height={400}
        onColumnRoleChange={() => {}}
        onMaxMarksChange={() => {}}
        onResolutionChange={() => {}}
      />,
    );

    const getCellContent = dataSheetSpy.mock.calls[0]?.[0]?.getCellContent;
    const nameCell = getCellContent!([0, 0]);
    expect(nameCell.kind).toBe(GridCellKind.Custom);
    expect(nameCell.data?.status).toBe("resolving");
  });

  it("wires onCellActivated for match popover", () => {
    const { columns, columnMapping, warnings, columnRoles } = buildFixtureState();
    const resolution = new Map([
      ["row-0:name", { status: "new" as const }],
    ]);

    render(
      <MarkSheetImportGrid
        headers={FIXTURE_HEADERS}
        rows={FIXTURE_ROWS}
        columns={columns}
        columnMapping={columnMapping}
        columnRoles={columnRoles as Record<number, import("@/lib/mark-sheets/column-map-role").ColumnMapRole>}
        resolution={resolution}
        rowIds={["row-0"]}
        rosterStudents={[]}
        warnings={warnings}
        height={400}
        onColumnRoleChange={() => {}}
        onMaxMarksChange={() => {}}
        onResolutionChange={() => {}}
      />,
    );

    const lastCall = dataSheetSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.gridProps?.onCellActivated).toBeTypeOf("function");
    expect(lastCall?.gridProps?.cellActivationBehavior).toBe("single-click");
  });

  it("opens match popover on activate with empty resolution using bounds", () => {
    const headers = ["English name", "Score"];
    const rows = [["Kyaw Thu", "55"]];
    const columns = headers.map((title, idx) => ({
      key: `col-${idx}`,
      title,
      kind: idx === 1 ? ("score" as const) : ("identifier" as const),
      sort_order: idx,
    }));

    render(
      <MarkSheetImportGrid
        headers={headers}
        rows={rows}
        columns={columns}
        columnMapping={{ name: 0 }}
        columnRoles={{ 0: "name", 1: "score" }}
        resolution={new Map()}
        rowIds={["row-0"]}
        rosterStudents={[]}
        warnings={[]}
        height={400}
        onColumnRoleChange={() => {}}
        onMaxMarksChange={() => {}}
        onResolutionChange={() => {}}
      />,
    );

    const onCellActivated = dataSheetSpy.mock.calls.at(-1)?.[0]?.gridProps?.onCellActivated;
    expect(onCellActivated).toBeTypeOf("function");
    act(() => {
      onCellActivated?.([0, 0], { x: 10, y: 20, width: 120, height: 36 });
    });

    expect(screen.getByTestId("match-popover-open")).toBeTruthy();
    expect(matchPopoverSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRow: 0,
        cell: { status: "new" },
        rect: { x: 10, y: 20, width: 120, height: 36 },
      }),
    );
  });
});
