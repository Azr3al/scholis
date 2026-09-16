"use client";

import { useEffect } from "react";
import { useEditor } from "@tiptap/react";
import TextEditor from "@/components/editor/editor";
import { getDefaultEditorOptions } from "@/components/editor/config";

export function RichBodyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    ...getDefaultEditorOptions(),
    content: value || "",
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && value !== undefined) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="space-y-1.5">
        <label>Body</label>
        <div className="h-24 rounded-md border bg-muted/20" />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label>Body</label>
      <TextEditor editor={editor} />
    </div>
  );
}
