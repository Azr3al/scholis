import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toSessionOptions } from "@/helpers/course/session-grouping";

import { SessionDateGrid } from "./session-date-grid";

const sessions = toSessionOptions(
  [
    { id: 1, date: "2026-08-03T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
    { id: 2, date: "2026-08-05T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
    { id: 3, date: "2026-09-02T02:30:00Z", time_from: "09:00:00", time_to: "11:00:00" },
  ],
  "Asia/Rangoon",
);

afterEach(() => {
  cleanup();
});

function setup(selectedIds: number[] = []) {
  const onToggleSession = vi.fn();
  const onToggleMonth = vi.fn();
  render(
    <SessionDateGrid
      sessions={sessions}
      selectedIds={new Set(selectedIds)}
      onToggleSession={onToggleSession}
      onToggleMonth={onToggleMonth}
      timeFormat="24h"
    />,
  );
  return { onToggleSession, onToggleMonth };
}

describe("SessionDateGrid", () => {
  it("toggles a single session by id", async () => {
    const { onToggleSession } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: /Mon 3/ }));
    expect(onToggleSession).toHaveBeenCalledWith(1);
  });

  it("asks to select the whole month when none of it is selected", async () => {
    const { onToggleMonth } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /select all sessions in August 2026/i }),
    );
    expect(onToggleMonth).toHaveBeenCalledWith("2026-08", true);
  });

  it("asks to deselect the whole month when all of it is selected", async () => {
    const { onToggleMonth } = setup([1, 2]);
    await userEvent.click(
      screen.getByRole("button", { name: /deselect all sessions in August 2026/i }),
    );
    expect(onToggleMonth).toHaveBeenCalledWith("2026-08", false);
  });

  it("shows per-month selected counts so partial months are obvious", () => {
    setup([1]);
    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
    expect(screen.getByText("0 of 1 selected")).toBeTruthy();
  });

  it("renders an empty state instead of empty month headers", () => {
    render(
      <SessionDateGrid
        sessions={[]}
        selectedIds={new Set()}
        onToggleSession={vi.fn()}
        onToggleMonth={vi.fn()}
        timeFormat="24h"
      />,
    );
    expect(screen.getByText(/no sessions yet/i)).toBeTruthy();
  });
});
