import { describe, expect, it } from "vitest";

import { resolveAllOption } from "./resolve-all-option";

describe("resolveAllOption", () => {
  it("returns explicit emptyOption first", () => {
    expect(
      resolveAllOption({
        emptyOption: { value: "", label: "No category" },
        placeholder: "All intakes",
        allowDeselect: true,
      }),
    ).toEqual({ value: "", label: "No category" });
  });

  it("injects All from an All-placeholder when deselect is allowed", () => {
    expect(
      resolveAllOption({
        placeholder: "All intakes",
        allowDeselect: true,
      }),
    ).toEqual({ value: "", label: "All intakes" });
  });

  it("does not inject All from a Select-placeholder", () => {
    expect(
      resolveAllOption({
        placeholder: "Select program",
        allowDeselect: true,
      }),
    ).toBeUndefined();
  });

  it("opts out when allOption is false", () => {
    expect(
      resolveAllOption({
        placeholder: "All intakes",
        allowDeselect: true,
        allOption: false,
      }),
    ).toBeUndefined();
  });

  it("uses allOption string as the All label", () => {
    expect(
      resolveAllOption({
        placeholder: "Search…",
        allOption: "All staff",
      }),
    ).toEqual({ value: "", label: "All staff" });
  });

  it("uses placeholder or All when allOption is true", () => {
    expect(resolveAllOption({ allOption: true })).toEqual({
      value: "",
      label: "All",
    });
    expect(
      resolveAllOption({ allOption: true, placeholder: "All courses" }),
    ).toEqual({ value: "", label: "All courses" });
  });
});
