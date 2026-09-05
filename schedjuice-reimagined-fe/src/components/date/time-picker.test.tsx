import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapHhmm, TimePicker } from "./time-picker";

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: null, isLoading: false, refetchTenant: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

function ControlledTimePicker({
  initial = "19:00",
  timeDisplayFormat = "24h" as "12h" | "24h",
  onChangeSpy,
}: {
  initial?: string;
  timeDisplayFormat?: "12h" | "24h";
  onChangeSpy?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TimePicker
      value={value}
      timeDisplayFormat={timeDisplayFormat}
      onChange={(next) => {
        onChangeSpy?.(next);
        setValue(next);
      }}
    />
  );
}

describe("snapHhmm", () => {
  it("snaps minutes to the 5-minute step", () => {
    expect(snapHhmm("19:33", 5)).toBe("19:35");
    expect(snapHhmm("19:32", 5)).toBe("19:30");
    expect(snapHhmm("19:00", 5)).toBe("19:00");
  });
});

describe("TimePicker", () => {
  it("offers 5-minute interval options by default in the popover", async () => {
    const user = userEvent.setup();
    render(
      <TimePicker
        value="19:00"
        onChange={vi.fn()}
        timeDisplayFormat="24h"
      />,
    );

    await user.click(screen.getByRole("button", { name: /open time picker/i }));

    const minutes = screen.getByRole("listbox", { name: /minutes/i });
    const options = within(minutes)
      .getAllByRole("option")
      .map((el) => el.textContent);

    expect(options).toEqual([
      "00",
      "05",
      "10",
      "15",
      "20",
      "25",
      "30",
      "35",
      "40",
      "45",
      "50",
      "55",
    ]);
    expect(within(minutes).queryByRole("option", { name: "31" })).toBeNull();
  });

  it("emits HH:mm when changing minute via popover in 24h mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TimePicker
        value="19:00"
        onChange={onChange}
        timeDisplayFormat="24h"
      />,
    );

    await user.click(screen.getByRole("button", { name: /open time picker/i }));

    const minutes = screen.getByRole("listbox", { name: /minutes/i });
    await user.click(within(minutes).getByRole("option", { name: "30" }));

    expect(onChange).toHaveBeenCalledWith("19:30");
  });

  it("increments hour with ArrowUp", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledTimePicker onChangeSpy={onChange} />);

    screen.getByRole("spinbutton", { name: /hour/i }).focus();
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenCalledWith("20:00");
  });

  it("types a new hour digit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledTimePicker onChangeSpy={onChange} />);

    screen.getByRole("spinbutton", { name: /hour/i }).focus();
    await user.keyboard("0");

    expect(onChange).toHaveBeenCalledWith("00:00");
  });
});
