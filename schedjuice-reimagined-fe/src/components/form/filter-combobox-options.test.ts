import { describe, expect, it } from "vitest";

import { filterComboboxOptionsByQuery } from "./filter-combobox-options";
import type { EntityComboboxOption } from "./entity-combobox-list";

describe("filterComboboxOptionsByQuery", () => {
  const options: EntityComboboxOption[] = [
    { value: "", label: "No student" },
    {
      value: "1",
      label: "Abel",
      searchText: "Abel Aung Aung abel@example.com",
    },
    {
      value: "2",
      label: "Albina",
      searchText: "Albina albina@example.com",
    },
  ];

  it("returns all options when query is empty", () => {
    expect(filterComboboxOptionsByQuery(options, "")).toEqual(options);
    expect(filterComboboxOptionsByQuery(options, "   ")).toEqual(options);
  });

  it("matches on label", () => {
    expect(filterComboboxOptionsByQuery(options, "abel")).toEqual([options[1]]);
    expect(filterComboboxOptionsByQuery(options, "albina")).toEqual([options[2]]);
  });

  it("matches on searchText when label would not match", () => {
    expect(filterComboboxOptionsByQuery(options, "aung@")).toEqual([]);
    expect(filterComboboxOptionsByQuery(options, "aung aung")).toEqual([options[1]]);
    expect(filterComboboxOptionsByQuery(options, "abel@example.com")).toEqual([
      options[1],
    ]);
  });

  it("falls back to label when searchText is missing", () => {
    const labelOnly: EntityComboboxOption[] = [
      { value: "3", label: "Charlie" },
    ];
    expect(filterComboboxOptionsByQuery(labelOnly, "char")).toEqual(labelOnly);
  });
});
