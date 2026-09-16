import { describe, expect, it } from "vitest";

import { isFieldClearable } from "./is-field-clearable";

describe("isFieldClearable", () => {
  it("is not clearable when required is omitted", () => {
    expect(isFieldClearable({})).toBe(false);
  });

  it("is clearable when required is false", () => {
    expect(isFieldClearable({ required: false })).toBe(true);
  });

  it("is not clearable when required is true", () => {
    expect(isFieldClearable({ required: true })).toBe(false);
  });

  it("lets explicit clearable win over required", () => {
    expect(isFieldClearable({ required: true, clearable: true })).toBe(true);
    expect(isFieldClearable({ required: false, clearable: false })).toBe(false);
  });
});
