import { describe, expect, it } from "vitest";
import { column } from "../columns";

describe("column.text", () => {
  it("defaults text columns to prose sizing role", () => {
    const col = column.text<{ id: number; name: string }>({
      id: "name",
      header: "Name",
      accessor: (row) => row.name,
    });
    expect(col.sizing).toEqual({ role: "prose" });
  });
});

describe("column.numeric", () => {
  it("defaults to numeric role and right alignment", () => {
    const col = column.numeric<{ amount: number }>({
      id: "amount",
      header: "Amount",
      accessor: (row) => row.amount,
    });
    expect(col.sizing?.role).toBe("numeric");
    expect(col.align).toBe("right");
  });
});
