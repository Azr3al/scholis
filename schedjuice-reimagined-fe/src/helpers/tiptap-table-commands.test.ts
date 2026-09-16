import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/react";
import { editorCanDeleteTable } from "./tiptap-table-commands";

function mockEditor(canReturn: Record<string, unknown>): Editor {
  return {
    can: () => canReturn,
  } as unknown as Editor;
}

describe("editorCanDeleteTable", () => {
  it("returns false when editor is null or undefined", () => {
    expect(editorCanDeleteTable(null)).toBe(false);
    expect(editorCanDeleteTable(undefined)).toBe(false);
  });

  it("returns false when deleteTable command is missing", () => {
    expect(editorCanDeleteTable(mockEditor({}))).toBe(false);
  });

  it("returns false when deleteTable is not a function", () => {
    expect(editorCanDeleteTable(mockEditor({ deleteTable: "nope" }))).toBe(false);
  });

  it("returns false when editor is destroyed", () => {
    expect(
      editorCanDeleteTable({
        isDestroyed: true,
        can: () => ({ deleteTable: () => true }),
      } as unknown as Editor),
    ).toBe(false);
  });

  it("returns false when editor.can() throws", () => {
    expect(
      editorCanDeleteTable({
        isDestroyed: false,
        can: () => {
          throw new TypeError("Cannot read properties of null (reading 'can')");
        },
      } as unknown as Editor),
    ).toBe(false);
  });

});
