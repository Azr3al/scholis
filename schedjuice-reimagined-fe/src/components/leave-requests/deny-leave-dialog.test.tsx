import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DenyLeaveDialog,
  isDenyConfirmEnabled,
} from "./deny-leave-dialog";

describe("DenyLeaveDialog", () => {
  it("disables confirm until denial reason is non-empty", async () => {
    render(
      <DenyLeaveDialog
        open
        isLoading={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const denyButton = screen.getByRole("button", { name: /deny request/i });
    expect(denyButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/denial reason/i), "Missing doctor note");
    expect(denyButton).toBeEnabled();
  });
});

describe("isDenyConfirmEnabled", () => {
  it("returns false for whitespace-only reason", () => {
    expect(isDenyConfirmEnabled("   ", false)).toBe(false);
  });

  it("returns false while loading", () => {
    expect(isDenyConfirmEnabled("Valid reason", true)).toBe(false);
  });
});
