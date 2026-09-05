"use client";

import "katex/dist/katex.min.css";
import {
  defaultEditorOptions,
  quizEditorExtensions,
  quizOptionEditorExtensions,
} from "@/components/editor/config";
import EditorMenu from "@/components/editor/menu";
import { convertToEditorDoc } from "@/helpers/convertToEditorDoc";
import { cn } from "@/lib/utils";
import type { Extensions, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo, useRef } from "react";

/** No outer border here — chrome comes from `.quiz-v3-tiptap` wrapper. */
const QUIZ_EDITOR_BASE_CLASS =
  "focus:outline-hidden border-0 bg-surface/80 px-2 py-2 sm:px-3";

/** Option rows: transparent surface so the parent card is the only “box”. */
const QUIZ_OPTION_PROSE_CLASS =
  "focus:outline-hidden border-0 bg-transparent px-2 py-2 sm:px-3";

function useQuizEditorBase(
  content: unknown,
  onUpdate: (editor: { getJSON: () => JSONContent; getText: () => string }) => void,
  minHeightClass: string,
  extensions: Extensions = quizEditorExtensions,
  proseClassName: string = QUIZ_EDITOR_BASE_CLASS,
) {
  /**
   * TipTap `useEditor` compares `content` by reference each render (deps `[]`).
   * Parent `body` updates on every keystroke → new `convertToEditorDoc` object →
   * `setOptions` → `onUpdate` → parent setState → infinite loop.
   * Only the first converted doc for this mounted editor should feed `content`.
   */
  const initialContentRef = useRef<JSONContent | null>(null);
  if (initialContentRef.current === null) {
    initialContentRef.current = convertToEditorDoc(content);
  }

  const editorProps = useMemo(
    () => ({
      ...defaultEditorOptions.editorProps,
      attributes: {
        class: cn(proseClassName, minHeightClass),
      },
    }),
    [minHeightClass, proseClassName],
  );

  return useEditor(
    {
      ...defaultEditorOptions,
      extensions,
      immediatelyRender: false,
      content: initialContentRef.current,
      onUpdate: ({ editor: ed }) => onUpdate(ed),
      editorProps,
    },
    [],
  );
}

type QuizImageToolbarProps = {
  quizId: number;
  onImageUploadPendingDelta: (delta: number) => void;
};

type PromptProps = QuizImageToolbarProps & {
  body: unknown;
  onChange: (patch: { body: JSONContent; body_plaintext: string }) => void;
  enableFillBlank?: boolean;
};

export function QuizPromptRichText({
  body,
  onChange,
  quizId,
  onImageUploadPendingDelta,
  enableFillBlank = false,
}: PromptProps) {
  const editor = useQuizEditorBase(
    body,
    (ed) =>
      onChange({
        body: ed.getJSON(),
        body_plaintext: ed.getText(),
      }),
    "min-h-[140px]",
  );

  if (!editor) return null;

  return (
    <div className="quiz-v3-tiptap overflow-x-auto overflow-y-visible rounded-lg border border-border bg-surface">
      <EditorContent editor={editor} />
      <div className="border-t border-border/70 bg-surface-sunken/10 px-1.5 py-1.5 dark:bg-surface-sunken/5 [&_button]:cursor-pointer [&_[data-slot=select-trigger]]:cursor-pointer sm:px-2 sm:py-2">
        <EditorMenu
          editor={editor}
          enableMathEquation
          enableFillBlank={enableFillBlank}
          embedded
          quizImageUpload={{
            quizId,
            onPendingDelta: onImageUploadPendingDelta,
          }}
        />
      </div>
    </div>
  );
}

type OptionProps = QuizImageToolbarProps & {
  body: unknown;
  onChange: (doc: JSONContent) => void;
};

export function QuizOptionRichText({
  body,
  onChange,
  quizId,
  onImageUploadPendingDelta,
}: OptionProps) {
  const editor = useQuizEditorBase(
    body,
    (ed) => onChange(ed.getJSON()),
    "min-h-[88px] cursor-text",
    quizOptionEditorExtensions,
    QUIZ_OPTION_PROSE_CLASS,
  );

  if (!editor) return null;

  return (
    <div className="quiz-v3-tiptap min-w-0 flex-1 overflow-hidden rounded-md border border-border/45 bg-surface-sunken/50 ring-1 ring-inset ring-border/25 dark:border-border/25 dark:bg-surface-sunken/30 dark:ring-border/15">
      <EditorContent editor={editor} />
      <div className="border-t border-border/50 bg-surface-sunken/55 px-1.5 py-1.5 dark:border-border/30 dark:bg-surface-sunken/35 [&_button]:cursor-pointer [&_[data-slot=select-trigger]]:cursor-pointer sm:px-2 sm:py-2">
        <EditorMenu
          editor={editor}
          enableMathEquation
          embedded
          quizImageUpload={{
            quizId,
            onPendingDelta: onImageUploadPendingDelta,
          }}
        />
      </div>
    </div>
  );
}
