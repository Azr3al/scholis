import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentEditorShell } from "./document-editor-shell";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const shellProps = {
  title: "Untitled",
  status: "draft" as const,
  onTitleChange: vi.fn(),
  onBack: vi.fn(),
  onSave: vi.fn(),
  onPublish: vi.fn(),
};

describe("DocumentEditorShell", () => {
  it("confirms Back when dirty and not accepted", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <DocumentEditorShell {...shellProps} onBack={onBack}>
        <div />
      </DocumentEditorShell>,
    );
    await user.click(screen.getByRole("button", { name: "Template name" }));
    const input = screen.getByRole("textbox", { name: "Template name" });
    await user.clear(input);
    await user.type(input, "Offer");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("does not show Fit or zoom chrome", () => {
    render(
      <DocumentEditorShell {...shellProps}>
        <div />
      </DocumentEditorShell>,
    );
    expect(screen.queryByText(/Fit|100%/)).toBeNull();
  });
});
