import { describe, expect, it } from "vitest";

import {
  buildEntitySelectItems,
  resolveEntitySelectValue,
} from "./entity-select";

describe("resolveEntitySelectValue", () => {
  it("returns string id when value is positive", () => {
    expect(resolveEntitySelectValue(12)).toBe("12");
  });

  it("returns null (not undefined) when empty so Base UI Select stays controlled", () => {
    expect(resolveEntitySelectValue(0)).toBeNull();
    expect(resolveEntitySelectValue(-1)).toBeNull();
  });

  it("returns emptyOption.value when provided and value is empty", () => {
    expect(
      resolveEntitySelectValue(0, { value: "", label: "All" }),
    ).toBe("");
  });
});

describe("buildEntitySelectItems", () => {
  const rows = [
    { id: 1, name: "Alpha" },
    { id: 2, name: "Beta" },
  ];

  it("maps rows with displayFunction", () => {
    const items = buildEntitySelectItems({
      rows,
      displayFunction: (e) => e.name,
      value: 0,
      isLoading: false,
    });
    expect(items).toEqual([
      { value: "1", label: "Alpha" },
      { value: "2", label: "Beta" },
    ]);
  });

  it("prepends emptyOption when provided", () => {
    const items = buildEntitySelectItems({
      rows,
      displayFunction: (e) => e.name,
      value: 0,
      isLoading: false,
      emptyOption: { value: "", label: "All" },
    });
    expect(items[0]).toEqual({ value: "", label: "All" });
    expect(items).toHaveLength(3);
  });

  it("adds missing-id fallback when value not in list", () => {
    const items = buildEntitySelectItems({
      rows,
      displayFunction: (e) => e.name,
      value: 99,
      isLoading: false,
    });
    expect(items[0]).toEqual({
      value: "99",
      label: "ID 99 (not in list)",
    });
  });

  it("shows loading fallback label while loading missing id", () => {
    const items = buildEntitySelectItems({
      rows: [],
      displayFunction: (e) => e.name,
      value: 7,
      isLoading: true,
    });
    expect(items[0]).toEqual({
      value: "7",
      label: "Loading name…",
    });
  });
});
