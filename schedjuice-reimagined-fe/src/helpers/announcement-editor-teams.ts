import type { Editor } from "@tiptap/react";

export function editorHasTeamsUnsupportedContent(editor: Editor): boolean {
  const { doc } = editor.state;
  let unsupported = false;
  doc.descendants((node) => {
    if (unsupported) return false;
    if (node.type.name === "table") unsupported = true;
    if (node.type.name === "taskList" || node.type.name === "taskItem") {
      unsupported = true;
    }
    if (node.marks.some((mark) => mark.type.name === "highlight")) {
      unsupported = true;
    }
    if (
      node.marks.some(
        (mark) => mark.type.name === "textStyle" && mark.attrs.fontSize,
      )
    ) {
      unsupported = true;
    }
  });
  return unsupported;
}
