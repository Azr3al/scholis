"use client";

import { DocumentEditorShell } from "@/components/document-editor/document-editor-shell";
import { DocumentFormatToolbar } from "@/components/document-editor/document-format-toolbar";
import { DocumentPage } from "@/components/document-editor/document-page";
import { Button, useToast } from "@/components/primitives";
import { pasteBlock } from "@/lib/document-template/clipboard";
import { asBlockDocument, ensureTextBlock } from "@/lib/document-template/empty";
import { resolveEditorShortcut } from "@/lib/document-template/editor-shortcuts";
import {
  commitChange,
  emptyHistory,
  redo,
  undo,
  type DocumentHistory,
} from "@/lib/document-template/history";
import {
  findBlock,
  findFirstTextBlockId,
  removeBlock,
  replaceBlock,
} from "@/lib/document-template/insert";
import { derivedStatus } from "@/lib/document-template/status";
import { unknownTokensInDocument } from "@/lib/document-template/tokens";
import type {
  BlockDocument,
  ColumnChild,
  DocumentBlock,
} from "@/lib/document-template/types";
import {
  getDocumentTemplate,
  publishDocumentTemplate,
  updateDocumentTemplate,
} from "@/lib/documents-api";
import { isAxiosError } from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function DocumentEditor() {
  const { templateId } = useParams<{ templateId: string }>();
  const id = Number(templateId);
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("Untitled");
  const [document, setDocument] = useState<BlockDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const historyRef = useRef<DocumentHistory>(emptyHistory());
  const documentRef = useRef<BlockDocument | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const clipboardRef = useRef<DocumentBlock | ColumnChild | null>(null);
  const applyDocumentRef = useRef<(
    next: BlockDocument,
    opts?: { fromHistory?: boolean },
  ) => void>(() => {});
  const saveRef = useRef<() => void>(() => {});

  const query = useQuery({
    queryKey: ["document-template", id],
    queryFn: () => getDocumentTemplate(id),
    enabled: Number.isFinite(id),
    retry: false,
  });

  const selectForDocument = (next: BlockDocument) => {
    setSelectedId(findFirstTextBlockId(next) ?? next.blocks[0]?.id ?? null);
  };

  const hydrate = (raw: unknown, markInjectedDirty: boolean) => {
    const parsed = asBlockDocument(raw);
    const { document: ensured, injected } = ensureTextBlock(parsed);
    historyRef.current = emptyHistory();
    setDocument(ensured);
    setDirty(markInjectedDirty && injected);
    selectForDocument(ensured);
  };

  const applyDocument = (
    next: BlockDocument,
    opts?: { fromHistory?: boolean },
  ) => {
    if (!opts?.fromHistory && document) {
      historyRef.current = commitChange(historyRef.current, document);
    }
    const { document: ensured, injected } = ensureTextBlock(next);
    setDocument(ensured);
    setDirty(true);
    if (injected) {
      setSelectedId(ensured.blocks[0]?.id ?? null);
      return;
    }
    setSelectedId((current) =>
      current && findBlock(ensured, current) ? current : null,
    );
  };
  documentRef.current = document;
  selectedIdRef.current = selectedId;
  applyDocumentRef.current = applyDocument;

  useEffect(() => {
    if (!query.data) return;
    setName(query.data.name?.trim() || "Untitled");
    hydrate(query.data.document, true);
    setTokenError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const doc = documentRef.current;
      if (!doc) return;
      const selected = selectedIdRef.current;
      const action = resolveEditorShortcut(event, {
        hasSelection: Boolean(selected),
        hasClipboard: Boolean(clipboardRef.current),
        titleFocused:
          event.target instanceof HTMLElement &&
          event.target.getAttribute("aria-label") === "Template name",
      });
      if (!action) return;
      event.preventDefault();
      const apply = applyDocumentRef.current;
      const selectedBlock = findBlock(doc, selected);
      if (action.type === "save") {
        saveRef.current();
        return;
      }
      if (action.type === "undo") {
        const result = undo(historyRef.current, doc);
        if (!result) return;
        historyRef.current = result.history;
        apply(result.document, { fromHistory: true });
        return;
      }
      if (action.type === "redo") {
        const result = redo(historyRef.current, doc);
        if (!result) return;
        historyRef.current = result.history;
        apply(result.document, { fromHistory: true });
        return;
      }
      if (action.type === "copy" && selectedBlock) {
        clipboardRef.current = structuredClone(selectedBlock);
        return;
      }
      if (action.type === "cut" && selected) {
        if (selectedBlock) clipboardRef.current = structuredClone(selectedBlock);
        apply(removeBlock(doc, selected));
        return;
      }
      if (action.type === "paste" && clipboardRef.current) {
        apply(pasteBlock(doc, selected, clipboardRef.current));
        return;
      }
      if (action.type === "delete" && selected) {
        apply(removeBlock(doc, selected));
        return;
      }
      if (
        (action.type === "toggleBold" || action.type === "toggleItalic") &&
        selectedBlock?.type === "text"
      ) {
        apply(
          replaceBlock(doc, {
            ...selectedBlock,
            bold:
              action.type === "toggleBold"
                ? !selectedBlock.bold
                : selectedBlock.bold,
            italic:
              action.type === "toggleItalic"
                ? !selectedBlock.italic
                : selectedBlock.italic,
          }),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const unknown = unknownTokensInDocument(document);
      if (unknown.length) {
        throw new Error(`Unknown token: ${unknown[0]}`);
      }
      return updateDocumentTemplate(id, { name, document });
    },
    onSuccess: (row) => {
      hydrate(row.document, true);
      setName(row.name);
      setTokenError(null);
      toast.add({ title: "Document saved." });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not save document.";
      if (message.startsWith("Unknown token:")) {
        setTokenError(message);
        return;
      }
      toast.add({ type: "error", title: "Could not save document." });
    },
  });
  saveRef.current = () => save.mutate();

  const publish = useMutation({
    mutationFn: async () => {
      const unknown = unknownTokensInDocument(document);
      if (unknown.length) {
        throw new Error(`Unknown token: ${unknown[0]}`);
      }
      if (dirty) {
        await updateDocumentTemplate(id, { name, document });
      }
      return publishDocumentTemplate(id);
    },
    onSuccess: (row) => {
      hydrate(row.document, true);
      setName(row.name);
      toast.add({ title: "Document published." });
      void query.refetch();
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not publish document.";
      if (message.startsWith("Unknown token:")) {
        setTokenError(message);
        return;
      }
      toast.add({ type: "error", title: "Could not publish document." });
    },
  });

  const goBack = () => {
    router.push("/studio");
  };

  const status = query.data
    ? derivedStatus({
        document,
        published_document: query.data.published_document,
      })
    : "draft";

  if (
    query.isError &&
    isAxiosError(query.error) &&
    (query.error.response?.status === 403 || query.error.response?.status === 404)
  ) {
    return (
      <div className="p-6">
        <p className="text-sm text-text-muted">This document is not available.</p>
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={goBack}>
          Back
        </Button>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-6">
        <p className="text-sm text-danger">Could not open this document.</p>
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={goBack}>
          Back
        </Button>
      </div>
    );
  }

  if (query.isLoading || document == null) {
    return <p className="p-6 text-sm text-text-muted">Loading…</p>;
  }

  const selected = findBlock(document, selectedId);

  return (
    <DocumentEditorShell
      title={name}
      status={status}
      dirty={dirty}
      onTitleChange={(next) => {
        setName(next);
        setDirty(true);
      }}
      onBack={goBack}
      onSave={() => save.mutate()}
      onPublish={() => publish.mutate()}
      saveDisabled={save.isLoading}
      formatBar={
        <DocumentFormatToolbar
          block={selected?.type === "text" ? selected : null}
          onChange={(next) => {
            applyDocument(replaceBlock(document, next));
          }}
        />
      }
    >
      <div>
        {tokenError ? (
          <p className="px-6 pt-4 text-sm text-red-300">{tokenError}</p>
        ) : null}
        <DocumentPage
          templateId={id}
          document={document}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={applyDocument}
        />
      </div>
    </DocumentEditorShell>
  );
}
