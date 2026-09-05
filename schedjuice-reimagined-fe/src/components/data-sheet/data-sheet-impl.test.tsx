import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridCellKind } from "@glideapps/glide-data-grid";

const dataEditorSpy = vi.fn();

vi.mock("@glideapps/glide-data-grid/dist/index.css", () => ({}));

vi.mock("@glideapps/glide-data-grid", async () => {
  const actual = await vi.importActual<typeof import("@glideapps/glide-data-grid")>(
    "@glideapps/glide-data-grid",
  );
  return {
    ...actual,
    DataEditor: (props: Record<string, unknown>) => {
      dataEditorSpy(props);
      return <div data-testid="data-editor" />;
    },
  };
});

import { DataSheet } from "@/components/data-sheet/data-sheet-impl";
import type { SheetAdapter } from "@/components/data-sheet/types";

const adapter: SheetAdapter = {
  rowCount: 1,
  getCellValue: () => "",
  setCellValue: () => "",
  isCellEditable: () => false,
};

const baseProps = {
  adapter,
  columns: [{ id: "email", title: "Email", width: 160 }],
  fieldByColumn: ["email"],
  height: 400,
  menus: { roleLabel: "Test sheet" },
  getCellContent: () => ({
    kind: GridCellKind.Text,
    data: "",
    displayData: "",
    allowOverlay: false,
  }),
  capabilities: {
    undo: false,
    copyPaste: false,
    statusBar: false,
    density: false,
    fontSize: false,
    contextMenu: false,
    gotoRow: false,
  },
};

function lastDataEditorProps() {
  return dataEditorSpy.mock.calls.at(-1)?.[0] as
    | {
        cellActivationBehavior?: string;
        onCellActivated?: unknown;
        onCellClicked?: unknown;
      }
    | undefined;
}

describe("DataSheet cell activation", () => {
  afterEach(() => {
    cleanup();
    dataEditorSpy.mockClear();
  });

  it("defaults to single-click and bridges onCellClicked when onCellActivated is provided", () => {
    render(
      <DataSheet
        {...baseProps}
        gridProps={{
          onCellActivated: () => {},
        }}
      />,
    );

    expect(lastDataEditorProps()?.cellActivationBehavior).toBe("single-click");
    expect(lastDataEditorProps()?.onCellActivated).toBeTypeOf("function");
    expect(lastDataEditorProps()?.onCellClicked).toBeTypeOf("function");
  });

  it("bridges click to activation for controlled gridSelection (import-style)", () => {
    const onCellActivated = vi.fn();
    const preventDefault = vi.fn();

    render(
      <DataSheet
        {...baseProps}
        gridProps={{
          gridSelection: {
            columns: { length: 0, hasIndex: () => false, hasAll: () => false, toArray: () => [] },
            rows: { length: 0, hasIndex: () => false, hasAll: () => false, toArray: () => [] },
          },
          onCellActivated,
        }}
      />,
    );

    lastDataEditorProps()?.onCellClicked?.([0, 0], { preventDefault });

    expect(onCellActivated).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("respects explicit cellActivationBehavior override", () => {
    render(
      <DataSheet
        {...baseProps}
        gridProps={{
          onCellActivated: () => {},
          cellActivationBehavior: "second-click",
        }}
      />,
    );

    expect(lastDataEditorProps()?.cellActivationBehavior).toBe("second-click");
  });

  it("does not wire activation handlers when onCellActivated is absent", () => {
    render(<DataSheet {...baseProps} />);

    expect(lastDataEditorProps()?.cellActivationBehavior).toBeUndefined();
    expect(lastDataEditorProps()?.onCellActivated).toBeUndefined();
    expect(lastDataEditorProps()?.onCellClicked).toBeUndefined();
  });

  it("uses caller onCellClicked without auto-bridging activation", () => {
    const onCellClicked = vi.fn();
    const onCellActivated = vi.fn();

    render(
      <DataSheet
        {...baseProps}
        gridProps={{
          onCellClicked,
          onCellActivated,
        }}
      />,
    );

    const preventDefault = vi.fn();
    lastDataEditorProps()?.onCellClicked?.([0, 0], { preventDefault });

    expect(onCellClicked).toHaveBeenCalledOnce();
    expect(onCellActivated).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
