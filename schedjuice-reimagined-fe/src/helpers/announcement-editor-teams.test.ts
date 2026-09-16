import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/react";
import { editorHasTeamsUnsupportedContent } from "./announcement-editor-teams";

function mockEditor(
  nodes: Array<{ typeName: string; marks?: Array<{ typeName: string; attrs?: Record<string, unknown> }> }>,
): Editor {
  return {
    state: {
      doc: {
        descendants(cb: (node: { type: { name: string }; marks: Array<{ type: { name: string }; attrs: Record<string, unknown> }> }) => boolean | void) {
          for (const node of nodes) {
            const result = cb({
              type: { name: node.typeName },
              marks: (node.marks ?? []).map((mark) => ({
                type: { name: mark.typeName },
                attrs: mark.attrs ?? {},
              })),
            });
            if (result === false) break;
          }
        },
      },
    },
  } as unknown as Editor;
}

describe("editorHasTeamsUnsupportedContent", () => {
  it("returns false for bold-only content", () => {
    expect(
      editorHasTeamsUnsupportedContent(
        mockEditor([{ typeName: "paragraph", marks: [{ typeName: "bold" }] }]),
      ),
    ).toBe(false);
  });

  it("returns true when font size is present", () => {
    expect(
      editorHasTeamsUnsupportedContent(
        mockEditor([
          {
            typeName: "paragraph",
            marks: [{ typeName: "textStyle", attrs: { fontSize: "1.25rem" } }],
          },
        ]),
      ),
    ).toBe(true);
  });

  it("returns true for tables and task lists", () => {
    expect(
      editorHasTeamsUnsupportedContent(mockEditor([{ typeName: "table" }])),
    ).toBe(true);
    expect(
      editorHasTeamsUnsupportedContent(mockEditor([{ typeName: "taskList" }])),
    ).toBe(true);
  });
});
