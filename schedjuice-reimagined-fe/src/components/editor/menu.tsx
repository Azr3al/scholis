"use client";
import { Button, buttonVariants, useToast } from "@/components/primitives";

import { MathEquationDialog } from "@/components/editor/math-equation-dialog";
import type { ComponentType, SVGProps } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import { EditorState, TextSelection } from "@tiptap/pm/state";

import { Bold, MediaImage as ImageIcon, Italic, Underline, Table, TaskList as ListTodo, SigmaFunction as Sigma, InputField as TextCursorInput, Trash as Trash2, List, NumberedListLeft as ListOrdered, DesignNib as Highlighter } from "iconoir-react";
import HoverMenu from "./hover-menu";
import HeadingMenu from "./heading-menu";
import FontSizeMenu from "./font-size-menu";
import { insertQuizTableWithTrailingParagraph } from "./insert-quiz-table";
import { cn } from "@/lib/utils";
import { useMemo, useRef, useState } from "react";
import { fetchQuizAttachmentPresignedUrl } from "@/helpers/attachment-api";
import { insertCourseFeedInlineImage } from "@/helpers/course-feed-inline-image-upload";
import { parseAttachmentUploadIds, uploadAttachments } from "@/helpers/file";
import { editorCanDeleteTable } from "@/helpers/tiptap-table-commands";
import { v4 as uuid } from "uuid";

const BUBBLE_MENU_OPTIONS = {
  placement: "top" as const,
  offset: 6,
};

/** Bubble menu defaults hide on empty selection; allow when the caret is inside a table cell. */
function bubbleMenuShouldShow({
  editor,
  state,
  from,
  to,
  element,
}: {
  editor: Editor;
  state: EditorState;
  from: number;
  to: number;
  element: HTMLElement;
}): boolean {
  if (!editor.isEditable) return false;
  const isChildOfMenu = element.contains(document.activeElement);
  const hasEditorFocus = editor.view.hasFocus() || isChildOfMenu;
  const inTableCell =
    editor.isActive("tableCell") || editor.isActive("tableHeader");
  if (inTableCell && hasEditorFocus) return true;

  const { empty } = state.selection;
  const isEmptyTextBlock =
    !state.doc.textBetween(from, to).length &&
    state.selection instanceof TextSelection;
  if (!hasEditorFocus || empty || isEmptyTextBlock) return false;
  return true;
}

interface EditorMenuProps {
  editor: Editor;
  enableMathEquation?: boolean;
  /** Quiz v3 fill-in-the-blank: insert at most one `quizFillBlank` node in the prompt. */
  enableFillBlank?: boolean;
  /**
   * Quiz / nested editors: one soft toolbar strip, wrap on narrow widths, no per-button outline boxes.
   */
  embedded?: boolean;
  /** Hide Teams-unsupported controls (highlight, font size, tables, checklists). */
  teamsSafe?: boolean;
  /** Compact toolbar for course feed composer. */
  variant?: "compact" | "full";
  /**
   * When set, shows an image picker that uploads to `attachments` with `table_name=quiz` (background upload + placeholder).
   */
  quizImageUpload?: {
    quizId: number;
    onPendingDelta: (delta: number) => void;
  };
  courseFeedImageUpload?: {
    courseId: number;
    onPendingDelta: (delta: number) => void;
  };
}

export type { EditorMenuProps };

function removeQuizImageByUploadId(editor: Editor, uploadId: string) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const ranges: { from: number; to: number }[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        if (node.attrs.uploadId === uploadId) {
          ranges.push({ from: pos, to: pos + node.nodeSize });
        }
      });
      ranges.sort((a, b) => b.from - a.from).forEach(({ from, to }) => tr.delete(from, to));
      return ranges.length > 0;
    })
    .run();
}

function replaceQuizImageAttrsByUploadId(
  editor: Editor,
  uploadId: string,
  nextAttrs: Record<string, unknown>,
) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      let changed = false;
      state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        if (node.attrs.uploadId !== uploadId) return;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...nextAttrs,
        });
        changed = true;
      });
      return changed;
    })
    .run();
}

type InlineAction = {
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  command: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
};

type BlockAction = {
  key: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  command: (editor: Editor) => void;
};

const INLINE_ACTIONS: InlineAction[] = [
  {
    key: "bold",
    icon: Bold,
    command: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive("bold"),
  },
  {
    key: "italic",
    icon: Italic,
    command: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive("italic"),
  },
  {
    key: "underline",
    icon: Underline,
    command: (editor) => editor.chain().focus().toggleUnderline().run(),
    isActive: (editor) => editor.isActive("underline"),
  },
];

const LIST_ACTIONS: InlineAction[] = [
  {
    key: "bulletList",
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive("bulletList"),
  },
  {
    key: "orderedList",
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive("orderedList"),
  },
];

const BLOCK_ACTIONS: BlockAction[] = [
  {
    key: "table",
    icon: Table,
    command: (editor) => insertQuizTableWithTrailingParagraph(editor),
  },
  {
    key: "checklist",
    icon: ListTodo,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
];

const SimpleEditorMenu = ({
  editor,
  enableMathEquation = false,
  enableFillBlank = false,
  embedded = false,
  teamsSafe = false,
  variant = "full",
  quizImageUpload,
  courseFeedImageUpload,
}: EditorMenuProps) => {
  const isEmbedded = variant === "compact" || embedded;
  const [mathOpen, setMathOpen] = useState(false);
  const bubbleOptions = useMemo(() => BUBBLE_MENU_OPTIONS, []);
  const canDeleteTable = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      teamsSafe || !ed || ed.isDestroyed ? false : editorCanDeleteTable(ed),
  });
  const toast = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const iconBtn = isEmbedded
    ? "h-9 w-9 shrink-0 rounded-md border-0 shadow-none sm:h-10 sm:w-10"
    : "h-12 w-12 rounded-lg border border-border shadow-xs";

  const blockBtn = isEmbedded
    ? "h-9 shrink-0 rounded-md border-0 px-2 text-sm font-normal shadow-none sm:h-10 sm:px-3 sm:text-base"
    : "h-12 rounded-lg border border-border px-4 text-base font-normal shadow-xs";

  const handleCourseFeedImageFile = async (file: File) => {
    if (!courseFeedImageUpload) return;
    const uploadId = uuid();
    try {
      await insertCourseFeedInlineImage(editor, file, {
        courseId: courseFeedImageUpload.courseId,
        uploadId,
        onPendingDelta: courseFeedImageUpload.onPendingDelta,
      });
    } catch {
      toast.add({
        title: "Image upload failed",
        description: "Try again or pick a different image.",
        type: "error",
      });
    }
  };

  const handleInlineImageFile = async (file: File) => {
    if (courseFeedImageUpload) {
      await handleCourseFeedImageFile(file);
      return;
    }
    await handleQuizImageFile(file);
  };

  const showImageUpload = Boolean(quizImageUpload || courseFeedImageUpload);

  const handleQuizImageFile = async (file: File) => {
    if (!quizImageUpload) return;
    const uploadId = uuid();
    const preview = URL.createObjectURL(file);
    quizImageUpload.onPendingDelta(1);
    editor
      .chain()
      .focus()
      .insertContent({
        type: "image",
        attrs: {
          src: preview,
          attachmentId: null,
          pending: true,
          uploadId,
        },
      })
      .run();

    try {
      const res = await uploadAttachments([file], "quiz", String(quizImageUpload.quizId));
      const ids = parseAttachmentUploadIds(res);
      const attachmentId = ids[0];
      if (attachmentId == null) {
        throw new Error("missing attachment id");
      }
      const presigned =
        (await fetchQuizAttachmentPresignedUrl(attachmentId, quizImageUpload.quizId)) ??
        preview;
      replaceQuizImageAttrsByUploadId(editor, uploadId, {
        src: presigned,
        attachmentId,
        pending: false,
        uploadId: null,
      });
      URL.revokeObjectURL(preview);
    } catch {
      toast.add({
        title: "Image upload failed",
        description: "Try again or pick a different image.",
        type: "error",
      });
      removeQuizImageByUploadId(editor, uploadId);
      URL.revokeObjectURL(preview);
    } finally {
      quizImageUpload.onPendingDelta(-1);
    }
  };

  return (
    <>
      {!teamsSafe ? (
        <BubbleMenu
          editor={editor}
          options={bubbleOptions}
          shouldShow={bubbleMenuShouldShow}
        >
          <HoverMenu editor={editor}></HoverMenu>
        </BubbleMenu>
      ) : null}

      <MathEquationDialog
        editor={editor}
        open={mathOpen}
        onOpenChange={setMathOpen}
      />

      <div
        className={cn(
          "sticky top-4 z-10 flex items-center",
          isEmbedded
            ? "min-w-0 flex-wrap gap-1 rounded-md bg-muted/35 px-1 py-1 dark:bg-muted/20 sm:gap-1.5 sm:px-1.5 sm:py-1.5"
            : "gap-2",
        )}
      >
        {INLINE_ACTIONS.map(({ key, icon: Icon, command, isActive }) => (
          <Button
            key={key}
            type="button"
            aria-label={key}
            variant={isActive(editor) ? "primary" : "ghost"}
            size="sm" onClick={() => command(editor)}
            className={iconBtn}
          >
            <Icon className={isEmbedded ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"} />
          </Button>
        ))}

        <HeadingMenu editor={editor} embedded={isEmbedded} />

        {LIST_ACTIONS.map(({ key, icon: Icon, command, isActive }) => (
          <Button
            key={key}
            type="button"
            aria-label={key}
            variant={isActive(editor) ? "primary" : "ghost"}
            size="sm" onClick={() => command(editor)}
            className={iconBtn}
          >
            <Icon className={isEmbedded ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"} />
          </Button>
        ))}

        {!teamsSafe ? (
          <>
            <Button
              type="button"
              aria-label="highlight"
              variant={editor.isActive("highlight") ? "primary" : "ghost"}
              size="sm" onClick={() => editor.chain().focus().toggleHighlight().run()}
              className={iconBtn}
            >
              <Highlighter
                className={isEmbedded ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"}
              />
            </Button>
            <FontSizeMenu editor={editor} embedded={isEmbedded} />
          </>
        ) : null}

        {enableMathEquation ? (
          <Button
            type="button"
            variant="ghost"
            aria-label="Insert equation"
            onClick={() => setMathOpen(true)}
            className={iconBtn}
          >
            <Sigma className={isEmbedded ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"} />
          </Button>
        ) : null}

        {enableFillBlank ? (
          <Button
            type="button"
            variant="secondary" aria-label="Add blank"
            title="Add blank"
            onClick={() => {
              editor.chain().focus().insertQuizFillBlank().run();
            }}
            className={cn(
              embedded
                ? "h-9 shrink-0 gap-1.5 rounded-md border-primary/60 bg-primary/5 px-2 text-xs font-semibold text-primary shadow-none hover:bg-primary/15 hover:text-primary sm:h-10 sm:px-2.5 sm:text-sm"
                : cn(
                    iconBtn,
                    "border-primary/60 bg-primary/5 text-primary shadow-xs hover:bg-primary/15 hover:text-primary",
                  ),
            )}
          >
            <TextCursorInput
              className={isEmbedded ? "h-4 w-4 shrink-0 sm:h-5 sm:w-5" : "h-5 w-5"}
            />
            {isEmbedded ? (
              <span className="whitespace-nowrap">Add blank</span>
            ) : null}
          </Button>
        ) : null}

        {showImageUpload ? (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleInlineImageFile(f);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="Insert image"
              onClick={() => imageInputRef.current?.click()}
              className={iconBtn}
            >
              <ImageIcon
                className={isEmbedded ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"}
              />
            </Button>
          </>
        ) : null}

        {!teamsSafe
          ? BLOCK_ACTIONS.map(({ key, icon: Icon, command }) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                onClick={() => command(editor)}
                className={blockBtn}
              >
                {Icon ? (
                  <Icon
                    className={isEmbedded ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"}
                  />
                ) : null}
              </Button>
            ))
          : null}
        {!teamsSafe && canDeleteTable ? (
          <Button
            type="button"
            variant="ghost"
            aria-label="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className={iconBtn}
          >
            <Trash2
              className={
                isEmbedded
                  ? "h-4 w-4 text-destructive sm:h-5 sm:w-5"
                  : "h-5 w-5 text-destructive"
              }
            />
          </Button>
        ) : null}
      </div>
    </>
  );
};

export default SimpleEditorMenu;
