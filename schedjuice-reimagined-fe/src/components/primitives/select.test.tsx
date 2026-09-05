import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ui/modal-overlay-context", () => ({
  useDropdownPositionerClassName: () => "",
}));

import {
  resolveControlledSelectValue,
  Select,
} from "./select";

afterEach(() => {
  cleanup();
});

describe("resolveControlledSelectValue", () => {
  const items = [{ value: "MM", label: "Myanmar" }] as const;

  it("returns undefined for empty values", () => {
    expect(resolveControlledSelectValue("", items)).toBeUndefined();
    expect(resolveControlledSelectValue(null, items)).toBeUndefined();
    expect(resolveControlledSelectValue(undefined, items)).toBeUndefined();
  });

  it("returns the value when it matches an item", () => {
    expect(resolveControlledSelectValue("MM", items)).toBe("MM");
  });

  it("returns undefined when the value is not in items", () => {
    expect(resolveControlledSelectValue("Myanmar", items)).toBeUndefined();
  });
});

describe("Select", () => {
  it("renders placeholder when controlled value is not in items", () => {
    render(
      <Select
        value="Myanmar"
        items={[{ value: "MM", label: "Myanmar" }]}
        placeholder="Select a country"
      />,
    );

    expect(screen.getByText("Select a country")).toBeTruthy();
  });
});
