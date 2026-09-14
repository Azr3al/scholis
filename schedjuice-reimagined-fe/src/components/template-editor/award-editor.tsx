"use client";

import { Artboard, type ArtboardHandle } from "@/components/template-editor/artboard";
import { AwardPreviewDialog } from "@/components/template-editor/award-preview-dialog";
import { EditorShell } from "@/components/template-editor/editor-shell";
import { LayersPanel } from "@/components/template-editor/layers-panel";
import { PageInspector } from "@/components/template-editor/page-inspector";
import { NamedPersonInspector } from "@/components/template-editor/named-person-inspector";
import { SelectedTextInspector } from "@/components/template-editor/selected-text-inspector";
import { useTemplateEditorKeys } from "@/components/template-editor/use-template-editor-keys";
import { useToast } from "@/components/primitives";
import { removeLayer } from "@/lib/image-template/layer-stack";
import {
  awardDocumentFromSavedTemplate,
  createAwardLayer,
  emptyAwardDocument,
  IDENTITY_FILL,
  parseAwardDocument,
} from "@/lib/image-template/award-document";
import { applyPagePreset, coverReplaceFill } from "@/lib/image-template/apply-page-preset";
import { pagePixelSize } from "@/lib/image-template/composite";
import { insertChromeForKind } from "@/lib/image-template/insert-chrome";
import { isTextLike } from "@/lib/image-template/layer-style";
import { applyInlineText } from "@/lib/image-template/scale-text-on-resize";
import {
  appendVariableToken,
  isTextVariableKey,
  layerCopy,
} from "@/lib/image-template/variable-template";
import { layerOriginForViewCenter } from "@/lib/image-template/place-layer";
import { shouldConfirmClose } from "@/lib/image-template/should-confirm-close";
import type { AwardDocument, Layer } from "@/lib/image-template/types";
import {
  getAwardCertificate,
  getAwardTitle,
  updateAwardCertificate,
} from "@/lib/awards-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function isBackgroundError(error: unknown): boolean {
  const details = (error as { response?: { data?: { details?: { background?: unknown } } } })
    ?.response?.data?.details;
  return Boolean(details && "background" in details);
}

export function AwardEditor({ titleId }: { titleId: number }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const artboardRef = useRef<ArtboardHandle>(null);
  const [document, setDocument] = useState<AwardDocument | null>(null);
  const [malformed, setMalformed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | "page" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [undo, setUndo] = useState<AwardDocument[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const pendingUrl = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile],
  );
  useEffect(() => () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
  }, [pendingUrl]);

  useEffect(() => {
    const url = pendingUrl ?? document?.background.url;
    if (!url) {
      setImageSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => setImageSize({ width: img.width, height: img.height });
    img.src = url;
  }, [pendingUrl, document?.background.url]);

  const certificateQuery = useQuery({
    queryKey: ["award-certificate", titleId],
    queryFn: () => getAwardCertificate(titleId),
    enabled: Number.isFinite(titleId),
  });
  const titleQuery = useQuery({
    queryKey: ["award-title", titleId],
    queryFn: () => getAwardTitle(titleId),
    enabled: Number.isFinite(titleId),
  });

  useEffect(() => {
    if (!certificateQuery.isSuccess) return;
    if (certificateQuery.data === null) {
      router.replace(`/award-titles/${titleId}/edit`);
      return;
    }
    const certificate = certificateQuery.data;
    const parsed = parseAwardDocument(certificate.document);
    if (parsed === null) {
      const raw = certificate.document;
      const empty =
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        Object.keys(raw as object).length === 0;
      if (!empty) {
        setMalformed(true);
        toast.add({ type: "error", title: "Could not open this certificate." });
        return;
      }
      setDocument({
        ...emptyAwardDocument(),
        background: { url: certificate.background_url, ...IDENTITY_FILL },
      });
      setDirty(false);
      return;
    }
    setDocument({
      ...parsed,
      background: { ...parsed.background, url: certificate.background_url },
    });
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast once on load
  }, [certificateQuery.data, certificateQuery.isSuccess, titleId, router]);

  const commit = useCallback((next: AwardDocument) => {
    setUndo((stack) => (document ? [...stack, document] : stack));
    setDocument(next);
    setDirty(true);
  }, [document]);

  const selected = document?.layers.find((layer) => layer.id === selectedId) ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("missing document");
      return updateAwardCertificate(titleId, {
        document,
        background: pendingFile ?? undefined,
      });
    },
    onSuccess: (saved) => {
      const next = awardDocumentFromSavedTemplate(saved);
      if (next) {
        setDocument(next);
      } else {
        setDocument((current) =>
          current
            ? {
                ...current,
                background: { ...current.background, url: saved.background_url },
              }
            : current,
        );
      }
      queryClient.setQueryData(["award-certificate", titleId], saved);
      setDirty(false);
      setPendingFile(null);
      toast.add({ title: "Certificate saved." });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: isBackgroundError(error)
          ? "Background image required"
          : "Could not save certificate.",
      });
    },
  });

  const homeHref = `/award-titles/${titleId}/edit`;
  const displayName = titleQuery.data?.name ?? "Untitled";

  const goHome = () => {
    if (
      shouldConfirmClose({ dirty, userAccepted: false }) &&
      !window.confirm("Discard unsaved changes?")
    ) {
      return;
    }
    router.push(homeHref);
  };

  const selectLayer = (id: string | "page" | null) => {
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!document || !selectedId || selectedId === "page") return;
    const next = removeLayer(document.layers, selectedId);
    if (next === document.layers) return;
    commit({ ...document, layers: next });
    setSelectedId("page");
  };

  useTemplateEditorKeys({
    onSave: () => save.mutate(),
    selectedId,
    onEscape: () =>
      setSelectedId((current) => {
        if (current && current !== "page") return "page";
        return null;
      }),
    onUndo: () => {
      setUndo((stack) => {
        const prev = stack[stack.length - 1];
        if (!prev) return stack;
        setDocument(prev);
        setDirty(true);
        return stack.slice(0, -1);
      });
    },
    onDeleteSelected: deleteSelected,
  });

  const chrome = useMemo(() => insertChromeForKind("award"), []);

  if (malformed) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-300">Could not open this certificate.</p>
        <button type="button" className="mt-3 underline" onClick={goHome}>
          Back
        </button>
      </div>
    );
  }

  if (!document || certificateQuery.isLoading || titleQuery.isLoading) {
    return <p className="p-6 text-sm text-text-muted">Loading…</p>;
  }

  const updateLayer = (layerId: string, next: Layer) => {
    commit({
      ...document,
      layers: document.layers.map((layer) => (layer.id === layerId ? next : layer)),
    });
  };

  const replaceBackground = (file: File) => {
    setPendingFile(file);
    setDirty(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = { width: img.width, height: img.height };
      if (document.width === 0 || document.height === 0) {
        commit(applyPagePreset(document, "original", size) as AwardDocument);
      } else {
        commit({
          ...document,
          background: coverReplaceFill(
            document.background.url,
            size,
            pagePixelSize(document),
          ),
        });
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <EditorShell
      section="Award titles"
      title={displayName}
      titleReadOnly
      onTitleChange={() => {}}
      backHref={homeHref}
      onBack={goHome}
      onSave={() => save.mutate()}
      onPreview={() => setPreviewOpen(true)}
      saveDisabled={save.isLoading}
      showPhoto={chrome.showPhoto}
      fieldItems={chrome.fieldItems}
      onAdd={(key) => {
        if (
          isTextVariableKey(key) &&
          key !== "named_person" &&
          selected &&
          isTextLike(selected)
        ) {
          updateLayer(
            selected.id,
            applyInlineText(selected, appendVariableToken(layerCopy(selected), key)),
          );
          return;
        }
        const sized = createAwardLayer(key, document.layers.length);
        const layer = createAwardLayer(
          key,
          document.layers.length,
          layerOriginForViewCenter({
            viewCenterDocument: artboardRef.current?.viewCenterDocument() ?? {
              x: document.width / 2,
              y: document.height / 2,
            },
            width: sized.width,
            height: sized.height,
          }),
        );
        commit({ ...document, layers: [...document.layers, layer] });
        setSelectedId(layer.id);
      }}
      inspector={
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) replaceBackground(file);
            }}
          />
          <PageInspector
              kind="award"
              pagePreset={document.pagePreset}
              width={document.width}
              height={document.height}
              onPreset={(preset, custom) => {
                if (!imageSize) return;
                try {
                  commit(
                    applyPagePreset(document, preset, imageSize, custom) as AwardDocument,
                  );
                } catch (error) {
                  toast.add({
                    type: "error",
                    title: error instanceof Error ? error.message : "Invalid size",
                  });
                }
              }}
              onReplaceFile={replaceBackground}
            />
          {selected?.type === "named_person" ? (
            <NamedPersonInspector
              layer={selected}
              onChange={(next) => updateLayer(selected.id, next)}
            />
          ) : null}
          {selected ? (
            <SelectedTextInspector
              layer={selected}
              onChange={(next) => updateLayer(selected.id, next)}
            />
          ) : null}
        </div>
      }
      layers={
        <LayersPanel
          layers={document.layers}
          selectedId={selectedId}
          onSelect={selectLayer}
          onDelete={deleteSelected}
          label={(layer) => layer.type}
        />
      }
    >
      <Artboard
        ref={artboardRef}
        page={pagePixelSize(document)}
        fill={{
          ...document.background,
          url: pendingUrl ?? document.background.url,
        }}
        layers={document.layers}
        selectedId={selectedId}
        onSelect={selectLayer}
        onChangeFill={(nextFill) => commit({ ...document, background: nextFill })}
        onChangeLayers={(nextLayers) => commit({ ...document, layers: nextLayers })}
        onPickBackground={() => fileRef.current?.click()}
      />
      <AwardPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={{
          ...document,
          background: {
            ...document.background,
            url: pendingUrl ?? document.background.url,
          },
        }}
        awardTitle={displayName}
      />
    </EditorShell>
  );
}
