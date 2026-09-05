import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CellAutosaveInput } from "../cell-autosave-input";

afterEach(() => {
  cleanup();
});

function renderCell(
  overrides: Partial<{
    displayValue: string;
    setLocalValue: (v: string) => void;
    commit: () => Promise<void>;
    status: "idle" | "saving" | "saved" | "error";
    showSavedTick: boolean;
    formatDisplay: (v: string) => string;
  }> = {},
) {
  const commit = vi.fn(async () => {});
  const setLocalValue = vi.fn();

  const view = render(
    <CellAutosaveInput
      autosave={{
        displayValue: overrides.displayValue ?? "2253",
        setLocalValue,
        commit,
        status: overrides.status ?? "idle",
        showSavedTick: overrides.showSavedTick ?? false,
      }}
      formatDisplay={overrides.formatDisplay}
    />,
  );

  return { commit, setLocalValue, ...view };
}

describe("CellAutosaveInput", () => {
  it("renders formatted display when idle", () => {
    renderCell({
      formatDisplay: (v) => `Ks ${Number(v).toLocaleString()}`,
    });

    const button = screen.getByRole("button", { name: "Click to edit" });
    expect(button.textContent).toContain("Ks 2,253");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("click reveals input; blur calls commit", () => {
    const { commit } = renderCell();

    fireEvent.click(screen.getByRole("button", { name: "Click to edit" }));
    const input = screen.getByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("2253");

    fireEvent.blur(input);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Click to edit" })).toBeTruthy();
  });

  it("Escape restores prior value without commit", () => {
    const { commit, setLocalValue } = renderCell();

    fireEvent.click(screen.getByRole("button", { name: "Click to edit" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(setLocalValue).toHaveBeenCalledWith("2253");
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows empty display when value is blank", () => {
    renderCell({ displayValue: "" });
    expect(
      screen.getByRole("button", { name: "Click to edit" }).textContent,
    ).toContain("—");
  });
});
