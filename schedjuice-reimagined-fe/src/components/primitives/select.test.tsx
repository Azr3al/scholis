import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ui/modal-overlay-context", () => ({
  useDropdownPositionerClassName: () => "",
}));

import { selectPositionerProps } from "@/lib/ui/select-layout";
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

describe("selectPositionerProps in jsdom", () => {
  it("defaults collisionBoundary to the viewport root", () => {
    expect(selectPositionerProps().collisionBoundary).toBe(
      document.documentElement,
    );
  });
});

describe("selectPositionerProps in jsdom", () => {
  it("defaults collisionBoundary to the viewport root", () => {
    expect(selectPositionerProps().collisionBoundary).toBe(
      document.documentElement,
    );
  });
});

describe("selectPositionerProps in jsdom", () => {
  it("defaults collisionBoundary to the viewport root", () => {
    expect(selectPositionerProps().collisionBoundary).toBe(
      document.documentElement,
    );
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

  it("hides clear when required", () => {
    render(
      <Select
        required
        value="MM"
        items={[{ value: "MM", label: "Myanmar" }]}
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
  });

  it("hides clear when no value is set", () => {
    render(
      <Select
        required={false}
        value=""
        items={[{ value: "MM", label: "Myanmar" }]}
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
  });

  it("clears an optional selected value to empty string", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select
        required={false}
        value="MM"
        items={[{ value: "MM", label: "Myanmar" }]}
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(onValueChange).toHaveBeenCalledWith("");
  });
});
