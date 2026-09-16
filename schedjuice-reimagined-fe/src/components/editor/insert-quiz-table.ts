import type { Editor } from "@tiptap/core";

/** Inserts a table and, when it becomes the last block, adds an empty paragraph below so users can keep typing. */
export function insertQuizTableWithTrailingParagraph(editor: Editor) {
  const didInsert = editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run();
  if (!didInsert) return;
  const { doc } = editor.state;
  const last = doc.lastChild;
  if (last?.type.name !== "table") return;
  const pos = doc.content.size;
  editor.chain().focus().insertContentAt(pos, { type: "paragraph" }).run();
}
