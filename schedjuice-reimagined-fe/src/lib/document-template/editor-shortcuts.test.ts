import { describe, expect, it } from "vitest";
import { resolveEditorShortcut } from "./editor-shortcuts";

describe("resolveEditorShortcut", () => {
  it("does not handle copy when a textarea is focused", () => {
    const action = resolveEditorShortcut(
      {
        key: "c",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        target: { tagName: "TEXTAREA" },
      },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toBeNull();
  });

  it("copies a selected block when focus is not a text field", () => {
    const action = resolveEditorShortcut(
      {
        key: "c",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        target: { tagName: "DIV" },
      },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toEqual({ type: "copy" });
  });

  it("does not toggle bold while the title field is focused", () => {
    const action = resolveEditorShortcut(
      {
        key: "b",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        target: { tagName: "INPUT" },
      },
      { hasSelection: true, hasClipboard: false, titleFocused: true },
    );
    expect(action).toBeNull();
  });

  it("toggles bold from a text-block textarea", () => {
    const action = resolveEditorShortcut(
      {
        key: "b",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        target: { tagName: "TEXTAREA" },
      },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toEqual({ type: "toggleBold" });
  });

  it("paste with an empty buffer is a no-op", () => {
    const action = resolveEditorShortcut(
      {
        key: "v",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        target: { tagName: "DIV" },
      },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toBeNull();
  });
});
