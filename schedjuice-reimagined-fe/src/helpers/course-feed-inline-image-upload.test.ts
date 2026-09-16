import { describe, expect, it } from "vitest";

import { serializeCourseFeedEditorHtml } from "./course-feed-inline-image-upload";

function makeEditor(html: string, imageNodes: Array<{ attachmentId: number; attachmentUrl: string }>) {
  return {
    getHTML: () => html,
    state: {
      doc: {
        descendants: (fn: (node: { type: { name: string }; attrs: Record<string, unknown> }) => void) => {
          for (const attrs of imageNodes) {
            fn({
              type: { name: "image" },
              attrs: {
                attachmentId: attrs.attachmentId,
                attachmentUrl: attrs.attachmentUrl,
                src: "blob:preview",
              },
            });
          }
        },
      },
    },
  };
}

describe("serializeCourseFeedEditorHtml", () => {
  it("returns html unchanged when no inline attachment urls are tracked", () => {
    const html = '<p>Hi</p><img src="blob:x" data-attachment-id="1" />';
    const editor = makeEditor(html, []);
    expect(serializeCourseFeedEditorHtml(editor as never)).toBe(html);
  });

  it("replaces blob src with server url for serialized submit html", () => {
    const html =
      '<p>Hi</p><img src="blob:preview" data-attachment-id="42" class="x" />';
    const editor = makeEditor(html, [
      { attachmentId: 42, attachmentUrl: "https://cdn.example/42.png" },
    ]);
    expect(serializeCourseFeedEditorHtml(editor as never)).toBe(
      '<p>Hi</p><img src="https://cdn.example/42.png" data-attachment-id="42" class="x" />',
    );
  });
});
