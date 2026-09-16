import { describe, expect, it } from "vitest";

import { makeReadOnlyAdapter } from "./read-only-adapter";

describe("makeReadOnlyAdapter", () => {
  const adapter = makeReadOnlyAdapter({
    rowCount: 2,
    getCellValue: (row, field) => `${field}:${row}`,
  });

  it("is never editable", () => {
    expect(adapter.isCellEditable(0, "name")).toBe(false);
  });
  it("setCellValue is a no-op (does not throw)", () => {
    expect(() => adapter.setCellValue(0, "name", "x")).not.toThrow();
  });
});
