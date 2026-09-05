import { describe, expect, it } from "vitest";

import { formatUserComboboxSearchText } from "./user-combobox-search";

describe("formatUserComboboxSearchText", () => {
  it("returns name only when alt name and email are missing", () => {
    expect(formatUserComboboxSearchText({ name: "Abel" })).toBe("Abel");
  });

  it("returns alt name only when name and email are missing", () => {
    expect(
      formatUserComboboxSearchText({
        alternative_name: "Aung Aung",
      }),
    ).toBe("Aung Aung");
  });

  it("returns email only when name and alt name are missing", () => {
    expect(
      formatUserComboboxSearchText({
        email: "abel@example.com",
      }),
    ).toBe("abel@example.com");
  });

  it("skips blank strings", () => {
    expect(
      formatUserComboboxSearchText({
        name: "Abel",
        alternative_name: "   ",
        email: "abel@example.com",
      }),
    ).toBe("Abel abel@example.com");
  });

  it("returns empty string when all fields are missing", () => {
    expect(formatUserComboboxSearchText({})).toBe("");
  });
});
