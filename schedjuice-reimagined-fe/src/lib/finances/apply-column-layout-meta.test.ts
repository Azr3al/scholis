import type { Column } from "@/components/data-table";
import { describe, expect, it } from "vitest";
import {
  applyColumnLayoutMeta,
  layoutMetaToColumnSizing,
} from "./apply-column-layout-meta";

describe("layoutMetaToColumnSizing", () => {
  it("maps money contentRole to numeric role with tabular nums", () => {
    const sizing = layoutMetaToColumnSizing({
      id: "parsed_amount",
      contentRole: "money",
      align: "right",
    });
    expect(sizing).toMatchObject({
      role: "numeric",
      tabular: true,
      align: "right",
    });
  });
});

describe("applyColumnLayoutMeta", () => {
  it("merges layout widths with existing column sizing without dropping widths", () => {
    const cols: Column<{ id: string }>[] = [
      {
        id: "name",
        header: "Name",
        accessor: (row) => row.id,
        sizing: { role: "person", width: { min: "10rem", max: "20rem" } },
      },
    ];

    const result = applyColumnLayoutMeta(cols, [
      {
        id: "name",
        contentRole: "person",
        minWidth: "12rem",
        preferredWidth: "14rem",
      },
    ]);

    expect(result[0].sizing?.width).toEqual({
      min: "12rem",
      preferred: "14rem",
      max: "20rem",
    });
  });

  it("maps truncate true to wrap truncate and false to nowrap", () => {
    const baseCol: Column<unknown> = {
      id: "email",
      header: "Email",
      accessor: () => "",
    };

    const truncated = applyColumnLayoutMeta([baseCol], [
      { id: "email", contentRole: "prose", truncate: true },
    ]);
    const nowrap = applyColumnLayoutMeta([baseCol], [
      { id: "email", contentRole: "prose", truncate: false },
    ]);

    expect(truncated[0].sizing?.wrap).toBe("truncate");
    expect(nowrap[0].sizing?.wrap).toBe("nowrap");
  });

  it("leaves columns without layout metadata unchanged", () => {
    const cols: Column<{ id: string }>[] = [
      {
        id: "orphan",
        header: "Orphan",
        accessor: (row) => row.id,
        sizing: { role: "prose" },
      },
    ];

    const result = applyColumnLayoutMeta(cols, [
      { id: "other", contentRole: "prose" },
    ]);

    expect(result[0]).toBe(cols[0]);
  });
});
