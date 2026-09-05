import { describe, expect, it } from "vitest";

import type { PointType } from "@/types/points";

import { buildStaffPointsColumns, cellText } from "./staff-sheet-columns";

function pointType(p: Partial<PointType>): PointType {
  return {
    id: 1,
    name: "Type",
    color: "#000",
    description: "",
    is_active: true,
    sort_order: 0,
    ...p,
  };
}

describe("buildStaffPointsColumns", () => {
  it("returns 3 fixed columns when no point types", () => {
    const cols = buildStaffPointsColumns([]);
    expect(cols).toHaveLength(3);
    expect(cols.map((c) => c.id)).toEqual(["name", "email", "roles"]);
  });

  it("adds one column per active point type (2 active → 5 total)", () => {
    const cols = buildStaffPointsColumns([
      pointType({ id: 2, name: "Merit", sort_order: 1 }),
      pointType({ id: 1, name: "Demerit", sort_order: 0 }),
      pointType({ id: 3, name: "Legacy", is_active: false }),
    ]);
    expect(cols).toHaveLength(5);
    expect(cols.map((c) => c.id)).toEqual([
      "name",
      "email",
      "roles",
      "pt_1",
      "pt_2",
    ]);
    expect(cols[3]?.title).toBe("Demerit");
    expect(cols[4]?.title).toBe("Merit");
  });
});

describe("cellText", () => {
  const row = {
    name: "Alex",
    email: "alex@example.com",
    roles: ["teacher", "admin"],
    balances: { "1": 5, "2": -2 },
  };

  it("formats point balance columns", () => {
    expect(cellText(row, "pt_1")).toBe("5");
    expect(cellText(row, "pt_2")).toBe("-2");
    expect(cellText(row, "pt_99")).toBe("0");
  });

  it("returns empty string for unknown columns", () => {
    expect(cellText(row, "unknown")).toBe("");
  });
});
