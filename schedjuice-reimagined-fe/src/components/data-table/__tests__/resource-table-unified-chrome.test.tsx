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

describe("ResourceTable unified list chrome", () => {
  it("wraps toolbar and table in one chrome container with pagination outside", () => {
    const { container } = render(
      <ResourceTable
        listChrome="unified"
        list={list}
        columns={columns}
        tableState={tableState}
        getRowId={(row) => row.id}
      />,
    );

    const root = container.firstChild as HTMLElement;
    const chrome = root.firstElementChild as HTMLElement;
    expect(chrome.className).toContain("rounded-md");
    expect(chrome.className).toContain("border-border-subtle");
    expect(chrome.className).toContain("bg-surface");

    expect(chrome.children).toHaveLength(2);
    expect(chrome.children[0]?.className).toContain("border-b");
    expect(chrome.children[1]?.querySelector("table")).toBeTruthy();

    const pagination = root.lastElementChild as HTMLElement;
    expect(pagination.textContent).toContain("Showing");
    expect(chrome.contains(pagination)).toBe(false);
  });

  it("uses inset table chrome without a second outer border", () => {
    const { container } = render(
      <ResourceTable
        listChrome="unified"
        list={list}
        columns={columns}
        tableState={tableState}
        getRowId={(row) => row.id}
      />,
    );

    const tableWrapper = container.querySelector("table")?.parentElement
      ?.parentElement as HTMLElement;
    expect(tableWrapper.className).toContain("border-0");
    expect(tableWrapper.className).toContain("bg-transparent");
    expect(tableWrapper.className).not.toContain("rounded-md");
  });
});
