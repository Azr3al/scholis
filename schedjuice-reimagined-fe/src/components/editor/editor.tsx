"use client";
import styles from "./styles.module.scss";
import { EditorContent, Editor } from "@tiptap/react";
import EditorMenu, { type EditorMenuProps } from "./menu";
import { useEffect } from "react";

interface TextEditorProps {
  editor: Editor;
  hideMenu?: boolean;
  editable?: boolean;
  label?: string;
  isViewOnly?: boolean;
  menuProps?: Pick<
    EditorMenuProps,
    "teamsSafe" | "variant" | "quizImageUpload" | "courseFeedImageUpload"
  >;
  menuPlacement?: "bottom" | "inline";
}

const TextEditor: React.FC<TextEditorProps> = ({
  editor,
  hideMenu,
  editable = true,
  label,
  isViewOnly,
  menuProps,
  menuPlacement = "bottom",
}) => {
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);

  const menu =
    !hideMenu && editor ? (
      <div
        className={
          menuPlacement === "inline"
            ? "border-t border-border/50 pt-2"
            : "py-4 border-b border-border"
        }
      >
        <EditorMenu editor={editor} {...menuProps} />
      </div>
    ) : null;

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div
        data-tiptap-view-mode={editable ? undefined : "true"}
        className={
          editable
            ? styles.editorShell
            : `min-w-0 ${styles.editorShell} ${styles.tiptapViewShell}`
        }
      >
        <EditorContent
          editor={editor}
          id={isViewOnly ? "editor-content" : "editor-content-form"}
          placeholder="Add description...."
        />
      </div>
      {menu}
    </div>
  );
};

export default TextEditor;
