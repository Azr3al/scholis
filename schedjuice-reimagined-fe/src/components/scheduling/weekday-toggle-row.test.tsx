import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekdayToggleRow } from "./weekday-toggle-row";

afterEach(() => {
  cleanup();
});

const days = ["Mon", "Tue", "Wed"] as const;

describe("WeekdayToggleRow", () => {
  it("renders day buttons with short accessible names", () => {
    render(
      <WeekdayToggleRow days={days} selected={["Mon"]} onToggle={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Mon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mon" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Tue" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("calls onToggle with the clicked day", () => {
    const onToggle = vi.fn();
    render(
      <WeekdayToggleRow days={days} selected={[]} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tue" }));
    expect(onToggle).toHaveBeenCalledWith("Tue");
  });

  it("does not toggle when disabled", () => {
    const onToggle = vi.fn();
    render(
      <WeekdayToggleRow
        days={days}
        selected={[]}
        disabled
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mon" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
