import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem, BulletList, OrderedList, ListItem } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import clsx from "clsx";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { Gapcursor } from "@tiptap/extensions/gap-cursor";
import {
  BlockMath,
  InlineMath,
  Mathematics,
} from "@tiptap/extension-mathematics";
import { QuizFillBlank } from "@/components/editor/quiz-fill-blank-extension";
import { QuizFillBlankGap } from "@/components/editor/quiz-fill-blank-gap-extension";
import { QuizImage } from "@/components/editor/quiz-image-extension";
import katex from "katex";
import { latexForQuizKatexRender } from "@/lib/normalizeMathliveKatexLatex";
import styles from "./styles.module.scss";

import type { Extensions } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { UseEditorOptions } from "@tiptap/react";
import { handleReadOnlyTiptapLinkClick } from "@/helpers/tiptapExternalLinkConfirm";

const tableHtmlClass = `${styles.tableClass} ${styles.tableWrapper}`;

const tableKitExtension = TableKit.configure({
  table: {
    resizable: true,
    allowTableNodeSelection: true,
    HTMLAttributes: {
      class: tableHtmlClass,
    },
  },
  tableRow: {
    HTMLAttributes: {
      class: tableHtmlClass,
    },
  },
  tableHeader: {
    HTMLAttributes: {
      class: tableHtmlClass,
    },
  },
  tableCell: {
    HTMLAttributes: {
      class: tableHtmlClass,
    },
  },
});

const headingExtension = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const levels = this.options.levels;
    const level = levels.includes(node.attrs.level)
      ? node.attrs.level
      : levels[0];
    const classes: Record<number, string> = {
      1: "text-4xl font-bold",
      2: "text-2xl text-muted-foreground font-bold",
      3: "text-2xl font-bold",
      4: "text-xl font-bold",
    };
    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: `${classes[level]}`,
      }),
      0,
    ];
  },
}).configure({ levels: [1, 2, 3, 4] });

const linkExtension = Link.configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: "https",
});

const defaulExtensions: Extensions = [
  Document,
  Paragraph.configure({
    HTMLAttributes: {
      class: " text-md",
    },
  }),
  Text,
  Bold,
  Italic,
  Underline,
  tableKitExtension,
  Gapcursor,
  UndoRedo,
  linkExtension,
  headingExtension,
];

const taskItemExtension = TaskItem.configure({
  nested: true,
  HTMLAttributes: {
    class: clsx("flex gap-3 items-start"),
  },
});

/**
 * Stable extension lists for TipTap `useEditor`: new arrays each render make
 * `setOptions` run every time and can cause update loops with `onUpdate`.
 */
export const defaultEditorExtensions: Extensions = [
  ...defaulExtensions,
  TaskList,
  taskItemExtension,
];

const announcementListItem = ListItem.configure({ HTMLAttributes: {} });

const announcementTeamsSafeExtensions: Extensions = [
  Document,
  Paragraph.configure({ HTMLAttributes: { class: " text-md" } }),
  Text,
  Bold,
  Italic,
  Underline,
  Gapcursor,
  UndoRedo,
  linkExtension,
  headingExtension,
  BulletList,
  OrderedList,
  announcementListItem,
];

const announcementFullExtensions: Extensions = [
  ...announcementTeamsSafeExtensions,
  Highlight.configure({ multicolor: false }),
  TextStyle,
  FontSize,
  tableKitExtension,
  TaskList,
  taskItemExtension,
];

export function getAnnouncementEditorExtensions(teamsSafe: boolean): Extensions {
  return teamsSafe ? announcementTeamsSafeExtensions : announcementFullExtensions;
}

export type AnnouncementEditorOptionsInput = {
  placeholder?: string;
  teamsSafe: boolean;
  borderless?: boolean;
};

const feedComposerEditorProps = {
  class:
    "focus:outline-hidden min-h-[4rem] text-sm text-foreground leading-relaxed",
};

export function getAnnouncementEditorOptions({
  placeholder,
  teamsSafe,
  borderless = false,
}: AnnouncementEditorOptionsInput): UseEditorOptions {
  const base = getDefaultEditorOptions();
  const extensions = [
    ...getAnnouncementEditorExtensions(teamsSafe),
    ...(placeholder
      ? [
          Placeholder.configure({
            placeholder,
            emptyNodeClass: "is-empty",
            emptyEditorClass: "is-editor-empty",
          }),
        ]
      : []),
  ];
  return {
    ...base,
    extensions,
    editorProps: {
      ...base.editorProps,
      attributes: borderless
        ? feedComposerEditorProps
        : base.editorProps?.attributes,
    },
  };
}

/** Read-only feed/announcement cards — full extensions for faithful render. */
export function getAnnouncementViewEditorOptions(): UseEditorOptions {
  return {
    ...getAnnouncementEditorOptions({ teamsSafe: false, borderless: true }),
    extensions: [
      ...getAnnouncementEditorExtensions(false),
      QuizImage.configure({ inline: true, allowBase64: false }),
    ],
  };
}

const quizKatexOptions = { throwOnError: false } as const;

/** Render-time fix for MathLive `\sqrt33`-style exports without mutating stored attrs. */
const InlineMathWithNormalize = InlineMath.extend({
  addNodeView() {
    const { katexOptions } = this.options;
    return ({ node, getPos }) => {
      const wrapper = document.createElement("span");
      wrapper.className = "tiptap-mathematics-render";
      if (this.editor.isEditable) {
        wrapper.classList.add("tiptap-mathematics-render--editable");
      }
      wrapper.dataset.type = "inline-math";
      wrapper.setAttribute("data-latex", node.attrs.latex);

      function renderMath() {
        const latex = latexForQuizKatexRender(node.attrs.latex);
        try {
          katex.render(latex, wrapper, katexOptions);
          wrapper.classList.remove("inline-math-error");
        } catch {
          wrapper.textContent = node.attrs.latex;
          wrapper.classList.add("inline-math-error");
        }
      }

      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = getPos();
        if (pos == null) return;
        this.options.onClick?.(node, pos);
      };

      if (this.options.onClick) {
        wrapper.addEventListener("click", handleClick);
      }

      renderMath();

      return {
        dom: wrapper,
        destroy() {
          wrapper.removeEventListener("click", handleClick);
        },
      };
    };
  },
});

const BlockMathWithNormalize = BlockMath.extend({
  addNodeView() {
    const { katexOptions } = this.options;
    return ({ node, getPos }) => {
      const wrapper = document.createElement("div");
      const innerWrapper = document.createElement("div");
      wrapper.className = "tiptap-mathematics-render";
      if (this.editor.isEditable) {
        wrapper.classList.add("tiptap-mathematics-render--editable");
      }
      innerWrapper.className = "block-math-inner";
      wrapper.dataset.type = "block-math";
      wrapper.setAttribute("data-latex", node.attrs.latex);
      wrapper.appendChild(innerWrapper);

      function renderMath() {
        const latex = latexForQuizKatexRender(node.attrs.latex);
        try {
          katex.render(latex, innerWrapper, katexOptions);
          wrapper.classList.remove("block-math-error");
        } catch {
          wrapper.textContent = node.attrs.latex;
          wrapper.classList.add("block-math-error");
        }
      }

      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const pos = getPos();
        if (pos == null) return;
        this.options.onClick?.(node, pos);
      };

      if (this.options.onClick) {
        wrapper.addEventListener("click", handleClick);
      }

      renderMath();

      return {
        dom: wrapper,
        destroy() {
          wrapper.removeEventListener("click", handleClick);
        },
      };
    };
  },
});

const mathematicsExtension = Mathematics.extend({
  addExtensions() {
    return [
      BlockMathWithNormalize.configure({
        ...this.options.blockOptions,
        katexOptions: this.options.katexOptions,
      }),
      InlineMathWithNormalize.configure({
        ...this.options.inlineOptions,
        katexOptions: this.options.katexOptions,
      }),
    ];
  },
}).configure({
  katexOptions: quizKatexOptions,
});

export const quizEditorExtensions: Extensions = [
  ...defaultEditorExtensions,
  mathematicsExtension,
  QuizFillBlank,
  QuizFillBlankGap,
  QuizImage.configure({
    inline: true,
    allowBase64: false,
    HTMLAttributes: {
      class: "quiz-v3-inline-image max-w-full h-auto rounded-md align-middle",
    },
  }),
];

/** Answer-choice editors only: hints that the field is editable when empty. */
export const quizOptionEditorExtensions: Extensions = [
  ...quizEditorExtensions,
  Placeholder.configure({
    placeholder: "Type this answer…",
    emptyNodeClass: "is-empty",
    emptyEditorClass: "is-editor-empty",
  }),
];

export const getDefaultEditorOptions = () => {
  const cp = { ...defaultEditorOptions };
  cp.extensions = defaultEditorExtensions;
  return cp;
};

/** Qualifications editor — default extensions plus inline attachment images. */
export function getQualificationsEditorOptions(): UseEditorOptions {
  const base = getDefaultEditorOptions();
  return {
    ...base,
    extensions: [...defaultEditorExtensions, QuizImage],
  };
}

/** Borderless feed composer — placeholder + minimal chrome. */
export function getFeedComposerEditorOptions(
  placeholder: string,
  teamsSafe = false,
): UseEditorOptions {
  const base = getAnnouncementEditorOptions({
    placeholder,
    teamsSafe,
    borderless: true,
  });
  return {
    ...base,
    extensions: [
      ...(base.extensions ?? []),
      QuizImage.configure({ inline: true, allowBase64: false }),
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  };
}

export const getEmailEditorOptions = () => {
  const cp = { ...defaultEditorOptions };
  cp.extensions = defaulExtensions;
  return cp;
};

export const getQuizEditorExtensions = (): Extensions => quizEditorExtensions;

export const getQuizEditorOptions = (): UseEditorOptions => {
  const base = getDefaultEditorOptions();
  return {
    ...base,
    extensions: quizEditorExtensions,
  };
};

/** Browsers often map Cmd/Opt/Ctrl + these keys to history/scroll instead of the editor. */
const _EDITOR_NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

function isAppleUserAgent(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

function horizontalArrowGranularity(event: KeyboardEvent): "word" | "lineboundary" {
  const apple = isAppleUserAgent();
  if (apple && event.metaKey && !event.altKey && !event.ctrlKey) {
    return "lineboundary";
  }
  return "word";
}

/** Map a flat text index (from `textBetween` + `\\ufffc` for atoms) to an absolute doc position. */
function docPosAtPlainOffsetInTextblock(
  parent: PMNode,
  parentContentStart: number,
  plainTarget: number,
): number {
  let plainSeen = 0;
  let pos = parentContentStart;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (child.isText) {
      const L = (child.text ?? "").length;
      if (plainSeen + L >= plainTarget) {
        return pos + (plainTarget - plainSeen);
      }
      plainSeen += L;
      pos += child.nodeSize;
    } else {
      if (plainSeen >= plainTarget) return pos;
      plainSeen += 1;
      pos += child.nodeSize;
    }
  }
  return pos;
}

/**
 * macOS-style Option+← / Option+→: move by “word” (Intl.Segmenter when available).
 */
function macOptionArrowPlainOffset(
  text: string,
  offset: number,
  key: "ArrowLeft" | "ArrowRight",
): number {
  if (typeof Intl.Segmenter === "function") {
    try {
      const segs = Array.from(
        new Intl.Segmenter(undefined, { granularity: "word" }).segment(text),
      );
      if (key === "ArrowLeft") {
        if (offset <= 0) return 0;
        for (const s of segs) {
          if (
            offset > s.index &&
            offset < s.index + s.segment.length &&
            s.isWordLike
          ) {
            return s.index;
          }
        }
        let prev: number | null = null;
        for (const s of segs) {
          if (s.index >= offset) break;
          if (s.isWordLike) prev = s.index;
        }
        return prev ?? 0;
      }
      const n = text.length;
      if (offset >= n) return n;
      for (const s of segs) {
        if (
          offset >= s.index &&
          offset < s.index + s.segment.length &&
          s.isWordLike
        ) {
          return s.index + s.segment.length;
        }
      }
      for (const s of segs) {
        if (s.index > offset && s.isWordLike) {
          return s.index + s.segment.length;
        }
      }
      return n;
    } catch {
      /* regex fallback */
    }
  }

  const isLetterOrNumber = (char: string) => /\w/.test(char);
  if (key === "ArrowLeft") {
    if (offset <= 0) return 0;
    let i = offset;
    while (i > 0 && !isLetterOrNumber(text[i - 1]!)) i--;
    while (i > 0 && isLetterOrNumber(text[i - 1]!)) i--;
    return i;
  }
  const n = text.length;
  if (offset >= n) return n;
  let i = offset;
  while (i < n && !isLetterOrNumber(text[i]!)) i++;
  while (i < n && isLetterOrNumber(text[i]!)) i++;
  return i;
}

/** Collapsed caret only; Shift+Option still uses native `modify` + sync. */
function appleOptionArrowWordSelection(
  view: EditorView,
  key: "ArrowLeft" | "ArrowRight",
): TextSelection | null {
  const pmSel = view.state.selection;
  if (!(pmSel instanceof TextSelection) || !pmSel.empty) return null;
  const $from = pmSel.$from;
  const parent = $from.parent;
  if (!parent.isTextblock) return null;
  const parentStart = $from.start($from.depth);
  const text = parent.textBetween(0, parent.content.size, "", "\ufffc");
  const plainOffset = $from.parentOffset;
  if (plainOffset < 0 || plainOffset > text.length) return null;
  const nextPlain = macOptionArrowPlainOffset(text, plainOffset, key);
  if (nextPlain === plainOffset) return null;
  const docPos = docPosAtPlainOffsetInTextblock(parent, parentStart, nextPlain);
  try {
    return TextSelection.create(view.state.doc, docPos);
  } catch {
    return null;
  }
}

/**
 * `handleDOMEvents.keydown` + preventDefault() skips ProseMirror's main keydown
 * path entirely (see prosemirror-view `runCustomHandler`), so word/history keys
 * must be handled in `handleKeyDown` instead.
 *
 * Uses the native selection's `modify()` for movement, then syncs PM state.
 */
export function handleModifierNavigationKeyDown(
  view: EditorView,
  event: Event,
): boolean {
  if (!(event instanceof KeyboardEvent)) return false;
  if (!_EDITOR_NAV_KEYS.has(event.key)) return false;
  if (!event.altKey && !event.metaKey && !event.ctrlKey) return false;

  // Let PM handle vertical arrows (captureKeyDown / selectVertically).
  if (event.key === "ArrowUp" || event.key === "ArrowDown") return false;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || typeof sel.modify !== "function")
    return false;

  const root = view.dom;
  if (
    !sel.anchorNode ||
    !sel.focusNode ||
    !root.contains(sel.anchorNode) ||
    !root.contains(sel.focusNode)
  ) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const alter = event.shiftKey ? "extend" : "move";
  const apple = isAppleUserAgent();

  try {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const dir = event.key === "ArrowLeft" ? "backward" : "forward";
      const useMacOptionWord =
        apple &&
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        view.state.selection instanceof TextSelection &&
        view.state.selection.empty;

      if (useMacOptionWord) {
        const stepped = appleOptionArrowWordSelection(view, event.key);
        if (stepped) {
          view.dispatch(view.state.tr.setSelection(stepped).scrollIntoView());
          return true;
        }
      }

      sel.modify(alter, dir, horizontalArrowGranularity(event));
    } else if (event.key === "Home") {
      if (event.ctrlKey || (apple && event.metaKey)) {
        sel.modify(alter, "backward", "documentboundary");
      } else {
        sel.modify(alter, "backward", "lineboundary");
      }
    } else if (event.key === "End") {
      if (event.ctrlKey || (apple && event.metaKey)) {
        sel.modify(alter, "forward", "documentboundary");
      } else {
        sel.modify(alter, "forward", "lineboundary");
      }
    }

    const anchorNode = sel.anchorNode;
    const focusNode = sel.focusNode;
    if (!anchorNode || !focusNode) return true;

    const anchorPos = view.posAtDOM(anchorNode, sel.anchorOffset, 1);
    const headPos = event.shiftKey
      ? view.posAtDOM(focusNode, sel.focusOffset, 1)
      : anchorPos;

    const doc = view.state.doc;
    const clamp = (p: number) => Math.max(0, Math.min(doc.content.size, p));
    const nextSel = TextSelection.create(
      doc,
      clamp(anchorPos),
      clamp(headPos),
    );
    view.dispatch(view.state.tr.setSelection(nextSel).scrollIntoView());
  } catch {
    // DOM landed outside the document; browser navigation was still suppressed.
  }

  return true;
}

export const defaultEditorOptions: UseEditorOptions = {
  immediatelyRender: false,
  shouldRerenderOnTransaction: true,
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hello world! 🌍",
          },
        ],
      },
    ],
  },
  editorProps: {
    attributes: {
      class:
        "focus:outline-hidden border bg-background/80 p-2 rounded-md rounded-t-none min-h-40",
    },
    handleKeyDown: handleModifierNavigationKeyDown,
    handleDOMEvents: {
      click(view, event) {
        return handleReadOnlyTiptapLinkClick(view, event);
      },
    },
  },
};

export const emailRenderOptions: UseEditorOptions = {
  immediatelyRender: false,
  shouldRerenderOnTransaction: true,
  extensions: [
    Document,
    Paragraph.configure({
      HTMLAttributes: {
        class: " text-md",
      },
    }),
    Text,
    Bold,
    Italic,
    Underline,
    TableKit.configure({
      table: {
        resizable: true,
        allowTableNodeSelection: true,
        HTMLAttributes: {
          class: `tableClass tableWrapper`,
        },
      },
      tableRow: {
        HTMLAttributes: {
          class: `tableClass tableWrapper`,
        },
      },
      tableHeader: {
        HTMLAttributes: {
          class: `tableClass tableWrapper`,
        },
      },
      tableCell: {
        HTMLAttributes: {
          class: `tableClass tableWrapper`,
        },
      },
    }),
    Gapcursor,
    UndoRedo,
    TaskList,
    TaskItem.configure({
      nested: true,
      HTMLAttributes: {
        class: clsx("flex gap-3 items-start"),
      },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
    }),
    Heading.extend({
      renderHTML({ node, HTMLAttributes }) {
        const levels = this.options.levels;
        const level = levels.includes(node.attrs.level)
          ? node.attrs.level
          : levels[0];
        const classes: Record<number, string> = {
          1: "text-4xl font-bold",
          2: "text-2xl text-muted-foreground font-bold",
          3: "text-2xl font-bold",
          4: "text-xl font-bold",
        };
        return [
          `h${level}`,
          mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            class: `${classes[level]}`,
          }),
          0,
        ];
      },
    }).configure({ levels: [1, 2, 3, 4] }),
  ],
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hello world! 🌍",
          },
        ],
      },
    ],
  },
  editorProps: {
    attributes: {
      class:
        "focus:outline-hidden border p-1 m-1 rounded-md rounded-t-none border-t-0 min-h-40",
    },
    handleDOMEvents: {
      click(view, event) {
        return handleReadOnlyTiptapLinkClick(view, event);
      },
    },
  },
};
