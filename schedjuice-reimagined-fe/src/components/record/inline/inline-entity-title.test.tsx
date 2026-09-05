import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { InlineEntityTitle } from "./inline-entity-title";

afterEach(() => {
  cleanup();
});

function Harness({
  initial = "",
  placeholder = "untitled DVR",
}: {
  initial?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <InlineEntityTitle
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        aria-label="Name"
      />
      <pre data-testid="value">{value}</pre>
    </div>
  );
}

describe("InlineEntityTitle", () => {
  it("shows muted placeholder until clicked, then edits on blur", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText(/untitled dvr/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /^name$/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /edit name/i }));
    const input = screen.getByRole("textbox", { name: /^name$/i });
    await user.clear(input);
    await user.type(input, "Staff info check");
    await user.tab();

    expect(screen.getByTestId("value").textContent).toBe("Staff info check");
    expect(
      screen.getByRole("button", { name: /edit name/i }).textContent,
    ).toContain("Staff info check");
  });

  it("Escape cancels without committing draft", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Kept" />);

    await user.click(screen.getByRole("button", { name: /edit name/i }));
    const input = screen.getByRole("textbox", { name: /^name$/i });
    await user.clear(input);
    await user.type(input, "Discarded");
    await user.keyboard("{Escape}");

    expect(screen.getByTestId("value").textContent).toBe("Kept");
    expect(
      screen.getByRole("button", { name: /edit name/i }).textContent,
    ).toContain("Kept");
  });
});
