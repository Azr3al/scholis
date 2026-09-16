import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { v4 as uuid } from "uuid";

const FILL_BLANK_NODE = "quizFillBlank";

const fillBlankNodeClass =
  "quiz-fill-blank-node inline-block min-w-[1.75rem] rounded-sm border border-dashed border-primary/50 bg-muted/40 px-1.5 py-0.5 align-baseline text-center text-sm font-medium tabular-nums text-muted-foreground";

function countQuizFillBlanksBefore(doc: PMNode, beforePos: number): number {
  let n = 0;
  doc.nodesBetween(0, beforePos, (node) => {
    if (node.type.name === FILL_BLANK_NODE) n += 1;
  });
  return n;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    quizFillBlank: {
      insertQuizFillBlank: () => ReturnType;
    };
  }
}

/**
 * Inline placeholder for fill-in-the-blank prompts (quiz v3). Multiple blanks allowed.
 */
export const QuizFillBlank = Node.create({
  name: FILL_BLANK_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      blankId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-blank-id"),
        renderHTML: (attrs) => {
          if (!attrs.blankId) return {};
          return { "data-blank-id": attrs.blankId as string };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-quiz-fill-blank="1"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-quiz-fill-blank": "1",
        class: fillBlankNodeClass,
      }),
      "—",
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span");
      dom.setAttribute("data-quiz-fill-blank", "1");
      dom.className = fillBlankNodeClass;
      const id = node.attrs.blankId as string | null;
      if (id) dom.setAttribute("data-blank-id", id);

      const refresh = () => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        const index = countQuizFillBlanksBefore(editor.state.doc, pos) + 1;
        dom.textContent = String(index);
        dom.setAttribute("aria-label", `Blank ${index}`);
      };

      const onEditorUpdate = () => {
        refresh();
      };

      editor.on("update", onEditorUpdate);
      refresh();

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== FILL_BLANK_NODE) return false;
          const nextId = updatedNode.attrs.blankId as string | null;
          if (nextId) dom.setAttribute("data-blank-id", nextId);
          else dom.removeAttribute("data-blank-id");
          refresh();
          return true;
        },
        destroy: () => {
          editor.off("update", onEditorUpdate);
        },
      };
    };
  },

  addCommands() {
    return {
      insertQuizFillBlank:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { blankId: uuid() },
            })
            .run(),
    };
  },
});
