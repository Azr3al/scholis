import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Inline read-only gap node used in taker / preview / results views in place
 * of the editor's `quizFillBlank` placeholder. Renders as `<span data-blank-id="…">`
 * carrying the original blank UUID so consumers can target a specific blank
 * (e.g. highlight on hover from the answer panel).
 */
const FILL_BLANK_GAP_NODE = "quizFillBlankGap";

const gapStaticClass =
  "quiz-fill-blank-taker-gap rounded-sm px-0.5 transition-colors";

export const QuizFillBlankGap = Node.create({
  name: FILL_BLANK_GAP_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
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
    return [{ tag: 'span[data-quiz-fill-blank-gap="1"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-quiz-fill-blank-gap": "1",
        class: gapStaticClass,
      }),
      " ______ ",
    ];
  },
});
