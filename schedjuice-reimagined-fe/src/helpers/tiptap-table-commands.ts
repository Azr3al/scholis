import type { Editor } from "@tiptap/react";

export function editorCanDeleteTable(editor: Editor | null | undefined): boolean {
  if (!editor || editor.isDestroyed) return false;
  try {
    const can = editor.can() as { deleteTable?: () => boolean };
    return typeof can.deleteTable === "function" && can.deleteTable();
  } catch {
    return false;
  }
}
