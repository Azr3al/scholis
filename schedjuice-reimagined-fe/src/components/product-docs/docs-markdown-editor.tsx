"use client";
import { useToast } from "@/components/primitives";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ToolbarSegment,
  ToolbarSegmentGroup,
} from "@/components/shell/toolbar-segment-group";
import { uploadDocMedia } from "@/lib/product-docs-api";
import { classifyMediaFile } from "@/lib/product-docs/media-markdown";
import { cn } from "@/lib/utils";

import MarkdownRenderer from "../markdown/markdown-renderer";
import {
  docsEditorExtensions,
  insertTextAt,
  pendingUploadsField,
  prefixForInsert,
  setPendingUploadsEffect,
  type PendingUpload,
} from "./docs-markdown-editor-extensions";

type DocsMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  articleId?: number;
};

export function DocsMarkdownEditor({ value, onChange, articleId }: DocsMarkdownEditorProps) {
  const toast = useToast();
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [dragActive, setDragActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const uploadsRef = useRef<Map<string, AbortController>>(new Map());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const syncPendingUploads = useCallback((view: EditorView, uploads: PendingUpload[]) => {
    view.dispatch({ effects: setPendingUploadsEffect.of(uploads) });
  }, []);

  const startUpload = useCallback(
    async (view: EditorView, file: File, pos: number) => {
      const mediaType = classifyMediaFile(file);
      if (!mediaType) {
        toast.add({
          title: "Unsupported file",
          description: "Allowed: video/*, PNG, JPEG, GIF, WebP (images max 10 MB).",
          type: "error",
        });
        return;
      }

      const uploadId = crypto.randomUUID();
      const controller = new AbortController();
      uploadsRef.current.set(uploadId, controller);

      const pending: PendingUpload = {
        id: uploadId,
        pos,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
      };

      const current = view.state.field(pendingUploadsField);
      syncPendingUploads(view, [...current, pending]);

      try {
        const result = await uploadDocMedia(
          file,
          articleId,
          (pct) => {
            const next = view.state.field(pendingUploadsField).map((u) =>
              u.id === uploadId ? { ...u, progress: pct } : u,
            );
            syncPendingUploads(view, next);
          },
          controller.signal,
        );

        const prefix = prefixForInsert(view.state.doc, pos);
        const snippet = `${prefix}${result.markdown_snippet}\n`;
        insertTextAt(view, pos, snippet);
        onChangeRef.current(view.state.doc.toString());

        const without = view.state.field(pendingUploadsField).filter((u) => u.id !== uploadId);
        syncPendingUploads(view, without);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          toast.add({
            title: "Upload failed",
            description: err instanceof Error ? err.message : "Could not upload file.",
            type: "error",
          });
        }
        const without = view.state.field(pendingUploadsField).filter((u) => u.id !== uploadId);
        syncPendingUploads(view, without);
      } finally {
        uploadsRef.current.delete(uploadId);
      }
    },
    [articleId, syncPendingUploads, toast],
  );

  const handleFileAt = useCallback(
    (view: EditorView, file: File, pos: number) => {
      void startUpload(view, file, pos);
    },
    [startUpload],
  );

  useEffect(() => {
    if (!containerRef.current || mode !== "write") return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          docsEditorExtensions(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            paste(event, view) {
              const items = event.clipboardData?.items;
              if (!items) return false;
              for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                  event.preventDefault();
                  const file = item.getAsFile();
                  if (file) {
                    handleFileAt(view, file, view.state.selection.main.head);
                  }
                  return true;
                }
              }
              return false;
            },
            drop(event, view) {
              const files = event.dataTransfer?.files;
              if (!files?.length) return false;
              event.preventDefault();
              setDragActive(false);
              const pos =
                view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                view.state.selection.main.head;
              const file = files[0];
              if (file) handleFileAt(view, file, pos);
              return true;
            },
            dragover(event) {
              event.preventDefault();
              setDragActive(true);
            },
            dragleave() {
              setDragActive(false);
            },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      uploadsRef.current.forEach((c) => c.abort());
      uploadsRef.current.clear();
      view.destroy();
      viewRef.current = null;
    };
  }, [mode, handleFileAt]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || mode !== "write") return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value, mode]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm text-text-muted">
          Markdown supported. Drag or paste images.{" "}
          <Link
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-text-primary underline-offset-2 hover:underline"
            href="https://www.markdownguide.org/basic-syntax/"
          >
            Syntax guide
          </Link>
        </p>
        <ToolbarSegmentGroup aria-label="Editor mode">
          <ToolbarSegment
            active={mode === "write"}
            aria-pressed={mode === "write"}
            onClick={() => setMode("write")}
          >
            Write
          </ToolbarSegment>
          <ToolbarSegment
            active={mode === "preview"}
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            Preview
          </ToolbarSegment>
        </ToolbarSegmentGroup>
      </div>

      <div className="p-4">
        <div
          ref={containerRef}
          className={cn(
            "min-h-[320px] rounded-md font-mono text-sm leading-relaxed",
            mode !== "write" && "hidden",
            dragActive && "ring-2 ring-primary/30",
          )}
        />

        {mode === "preview" ? (
          <div
            className={cn(
              "min-h-[320px] rounded-md border border-border-subtle bg-surface-elevated p-4",
              !value.trim() && "flex items-center justify-center text-sm text-text-muted",
            )}
          >
            {value.trim() ? (
              <MarkdownRenderer value={value} />
            ) : (
              "Nothing to preview yet."
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
