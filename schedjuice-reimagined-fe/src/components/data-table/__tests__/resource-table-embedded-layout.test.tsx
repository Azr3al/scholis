import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResourceTable } from "../resource-table";
import type { Column } from "../types";

type Row = { id: string; name: string };

const columns: Column<Row>[] = [
  {
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
  },
];

const list = {
  rows: [{ id: "1", name: "Alice" }],
  total: 1,
  isLoading: false,
  isError: false,
  error: null,
  refetch: () => {},
};

const tableState = {
  page: 1,
  pageSize: 50,
  sorts: [] as string[],
  q: "",
  filters: {},
  setState: () => tableState,
};

describe("ResourceTable embedded layout", () => {
  it("pins toolbar and scrolls only the table region", () => {
    const { container } = render(
      <ResourceTable
        layout="embedded"
        list={list}
        columns={columns}
        tableState={tableState}
        getRowId={(row) => row.id}
      />,
    );

    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("h-full");
    expect(root.className).toContain("flex-col");

    const toolbar = root.firstElementChild as HTMLElement;
    expect(toolbar.className).toContain("shrink-0");
    expect(toolbar.className).not.toContain("sticky");

    const scrollRegion = root.children[1] as HTMLElement;
    expect(scrollRegion.className).toContain("overflow-auto");
    expect(scrollRegion.className).toContain("sj-scroll");
    expect(scrollRegion.className).toContain("flex-1");
    expect(scrollRegion.querySelector("table")).toBeTruthy();
  });
});
