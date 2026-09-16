// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table } from "../table";
import type { Column } from "../types";

type Row = { id: string; name: string; amount: number };

const columns: Column<Row>[] = [
  {
    id: "serial",
    header: "No.",
    accessor: (row) => row.id,
    sizing: {
      role: "identifier",
      width: { min: "3rem", preferred: "3rem" },
      sticky: "left",
    },
  },
  {
    id: "name",
    header: "Student",
    accessor: (row) => row.name,
    sizing: {
      role: "person",
      width: { min: "12rem", preferred: "14rem" },
      sticky: "left",
    },
  },
  {
    id: "amount",
    header: "Amount",
    accessor: (row) => row.amount,
    sizing: { role: "numeric" },
  },
];

const rows: Row[] = [{ id: "1", name: "Ada", amount: 42 }];

describe("Table sticky and resize", () => {
  it("renders sticky cells with left offsets when resizing is enabled", () => {
    const { container } = render(
      <Table
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        enableColumnResizing
      />,
    );

    const table = container.querySelector("table");
    expect(table?.style.tableLayout).toBe("fixed");

    const stickyCells = container.querySelectorAll("th[style*='position: sticky']");
    expect(stickyCells.length).toBeGreaterThanOrEqual(2);
    expect(stickyCells[0]?.getAttribute("style")).toContain("left: 0px");
    expect(stickyCells[1]?.getAttribute("style")).toContain("left: 48px");

    expect(container.querySelectorAll('[role="separator"]').length).toBe(3);
  });

  it("does not render resize handles when resizing is disabled", () => {
    const { container } = render(
      <Table columns={columns} rows={rows} getRowId={(row) => row.id} />,
    );

    const table = container.querySelector("table");
    expect(table?.style.tableLayout).toBe("auto");
    expect(container.querySelectorAll('[role="separator"]').length).toBe(0);
  });
});
