// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ColumnHeaderMenu } from "./column-header-menu";

afterEach(() => {
  cleanup();
});

describe("ColumnHeaderMenu", () => {
  it("invokes onCopy without calling sort handlers", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onSortAsc = vi.fn();
    render(
      <ColumnHeaderMenu
        label="Name"
        columnId="name"
        sorted={false}
        enableSorting
        enableCopy
        onSortAsc={onSortAsc}
        onSortDesc={vi.fn()}
        onClearSort={vi.fn()}
        onCopy={onCopy}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /column actions for name/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /copy column/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onSortAsc).not.toHaveBeenCalled();
  });

  it("calls onSortAsc from menu", async () => {
    const user = userEvent.setup();
    const onSortAsc = vi.fn();
    render(
      <ColumnHeaderMenu
        label="Email"
        columnId="email"
        sorted={false}
        enableSorting
        enableCopy
        onSortAsc={onSortAsc}
        onSortDesc={vi.fn()}
        onClearSort={vi.fn()}
        onCopy={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /column actions for email/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /sort ascending/i }));
    expect(onSortAsc).toHaveBeenCalledTimes(1);
  });

  it("hides clear sort when unsorted", async () => {
    const user = userEvent.setup();
    render(
      <ColumnHeaderMenu
        label="Name"
        columnId="name"
        sorted={false}
        enableSorting
        enableCopy
        onSortAsc={vi.fn()}
        onSortDesc={vi.fn()}
        onClearSort={vi.fn()}
        onCopy={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /column actions for name/i }),
    );
    expect(screen.queryByRole("menuitem", { name: /clear sort/i })).toBeNull();
  });
});
