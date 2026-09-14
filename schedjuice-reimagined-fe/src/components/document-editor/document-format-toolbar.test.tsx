import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTextBlock } from "@/lib/document-template/insert";
import { DocumentFormatToolbar } from "./document-format-toolbar";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DocumentFormatToolbar", () => {
  it("is not a dialog", () => {
    render(
      <DocumentFormatToolbar block={defaultTextBlock()} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables Bold when no text block is selected", () => {
    render(<DocumentFormatToolbar block={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Italic" })).toBeDisabled();
  });

  it("Bold click stamps bold true on the selected text block", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const block = defaultTextBlock();
    render(<DocumentFormatToolbar block={block} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenCalledWith({ ...block, bold: true });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("style");
  });
});
