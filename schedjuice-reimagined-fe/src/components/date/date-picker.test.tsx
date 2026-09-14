import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatePicker } from "./date-picker";

afterEach(() => {
  cleanup();
});

describe("DatePicker clear", () => {
  const date = new Date(2005, 8, 13);

  it("hides clear when no date is set", () => {
    render(<DatePicker required={false} date={undefined} setDate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
  });

  it("hides clear when required", () => {
    render(<DatePicker required date={date} setDate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
  });

  it("hides clear when clearable is false", () => {
    render(
      <DatePicker
        required={false}
        clearable={false}
        date={date}
        setDate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
  });

  it("hides clear when required is omitted", () => {
    render(<DatePicker date={date} setDate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
  });

  it("clears the date when optional and a date is set", async () => {
    const setDate = vi.fn();
    const user = userEvent.setup();
    render(<DatePicker required={false} date={date} setDate={setDate} />);

    await user.click(screen.getByRole("button", { name: "Clear date" }));

    expect(setDate).toHaveBeenCalledWith(undefined);
  });
});
