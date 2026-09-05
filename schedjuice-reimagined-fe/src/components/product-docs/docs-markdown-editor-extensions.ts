import { markdown } from "@codemirror/lang-markdown";
import { EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { parseMediaLine } from "@/lib/product-docs/media-markdown";

import { DocsMarkdownEditorMediaWidget } from "./docs-markdown-editor-media-widget";
import { DocsMarkdownEditorUploadPlaceholder } from "./docs-markdown-editor-upload-placeholder";

export type PendingUpload = {
  id: string;
  pos: number;
  fileName: string;
  fileSize: number;
  progress: number;
};

export const setPendingUploadsEffect = StateEffect.define<PendingUpload[]>();

export const pendingUploadsField = StateField.define<PendingUpload[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPendingUploadsEffect)) return effect.value;
    }
    return value;
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const uploads = state.field(field);
      const builder = new RangeSetBuilder<Decoration>();
      for (const upload of uploads) {
        builder.add(
          upload.pos,
          upload.pos,
          Decoration.widget({
            block: true,
            side: 1,
            widget: new UploadPlaceholderWidget(
              upload.fileName,
              upload.fileSize,
              upload.progress,
            ),
          }),
        );
      }
      return builder.finish();
    }),
});

class UploadPlaceholderWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private fileName: string,
    private fileSize: number,
    private progress: number,
  ) {
    super();
  }

  eq(other: UploadPlaceholderWidget) {
    return (
      other.fileName === this.fileName &&
      other.fileSize === this.fileSize &&
      other.progress === this.progress
    );
  }

  toDOM() {
    const wrap = document.createElement("div");
    this.root = createRoot(wrap);
    this.root.render(
      createElement(DocsMarkdownEditorUploadPlaceholder, {
        fileName: this.fileName,
        fileSize: this.fileSize,
        progress: this.progress,
      }),
    );
    return wrap;
  }

  destroy() {
    this.root?.unmount();
    this.root = null;
  }
}

class MediaLineWidget extends WidgetType {
  private root: Root | null = null;

  constructor(private lineText: string) {
    super();
  }

  eq(other: MediaLineWidget) {
    return other.lineText === this.lineText;
  }

  toDOM() {
    const wrap = document.createElement("div");
    const media = parseMediaLine(this.lineText);
    if (media) {
      this.root = createRoot(wrap);
      this.root.render(createElement(DocsMarkdownEditorMediaWidget, { media }));
    }
    return wrap;
  }

  destroy() {
    this.root?.unmount();
    this.root = null;
  }
}

function buildMediaLineDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const parsed = parseMediaLine(line.text);
    if (!parsed) continue;
    builder.add(
      line.from,
      line.to,
      Decoration.replace({
        widget: new MediaLineWidget(line.text),
        block: true,
      }),
    );
  }
  return builder.finish();
}

const mediaLineField = StateField.define<DecorationSet>({
  create(state) {
    return buildMediaLineDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildMediaLineDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const docsEditorTheme = EditorView.theme({
  "&": {
    minHeight: "320px",
    fontSize: "0.875rem",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  ".cm-content": {
    padding: 0,
    minHeight: "320px",
  },
  ".cm-line": {
    padding: "0 2px",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

export function docsEditorExtensions() {
  return [markdown(), pendingUploadsField, mediaLineField, docsEditorTheme];
}

export function insertTextAt(view: EditorView, pos: number, text: string) {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
}

export function prefixForInsert(doc: EditorState["doc"], pos: number): string {
  if (doc.length === 0) return "";
  const line = doc.lineAt(pos);
  if (line.text.length === 0) return "";
  return "\n";
}
