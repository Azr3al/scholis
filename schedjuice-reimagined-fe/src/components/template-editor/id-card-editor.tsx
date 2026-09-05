"use client";

import {
  fetchIdCardTemplate,
  updateIdCardTemplate,
} from "@/app/client-api/id-card-templates";
import {
  Artboard,
  type ArtboardHandle,
} from "@/components/template-editor/artboard";
import { EditorShell } from "@/components/template-editor/editor-shell";
import { PageInspector } from "@/components/template-editor/page-inspector";
import { LayersPanel } from "@/components/template-editor/layers-panel";
import { SelectedTextInspector } from "@/components/template-editor/selected-text-inspector";
import { useTemplateEditorKeys } from "@/components/template-editor/use-template-editor-keys";
import { Button, Checkbox, buttonVariants, useToast } from "@/components/primitives";
import { removeLayer } from "@/lib/image-template/layer-stack";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useTenant } from "@/hooks/useTenant";
import {
  documentToIdCardPayload,
  idCardTemplateToDocument,
} from "@/lib/image-template/adapters/id-card";
import { resolveIdCardBackgroundFill } from "@/lib/id-card/resolve-background-fill";
import {
  applyPagePreset,
  coverReplaceFill,
} from "@/lib/image-template/apply-page-preset";
import { pagePixelSize } from "@/lib/image-template/composite";
import { MalformedTemplateError } from "@/lib/image-template/malformed-template-error";
import { createIdCardLayer } from "@/lib/image-template/id-card-layer";
import { insertChromeForKind } from "@/lib/image-template/insert-chrome";
import { layerOriginForViewCenter } from "@/lib/image-template/place-layer";
import { shouldConfirmClose } from "@/lib/image-template/should-confirm-close";
import type { IdCardDocument, Layer } from "@/lib/image-template/types";
import { normalizeQrSlots } from "@/lib/id-card/template-geometry";
import type { IdCardTemplateSlot } from "@/types/id-card-template";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const HOME_HREF = "/organizations/profile?section=id-cards";

function resolveEditorBackHref(raw: string | null, fallback: string): string {
  if (raw == null || raw.trim() === "") return fallback;
  try {
    const decoded = decodeURIComponent(raw.trim());
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
    const path = decoded.includes("?") ? decoded.slice(0, decoded.indexOf("?")) : decoded;
    if (
      path === "/organizations/profile" ||
      /^\/internal\/organizations\/\d+$/.test(path)
    ) {
      return decoded;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function IdCardEditor() {
  const { templateId } = useParams<{ templateId: string }>();
  const id = Number(templateId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const orgIdFromQuery = searchParams.get("orgId");
  const parsedQueryOrgId =
    orgIdFromQuery != null &&
    orgIdFromQuery !== "" &&
    Number.isFinite(Number(orgIdFromQuery))
      ? Number(orgIdFromQuery)
      : null;
  const orgId = parsedQueryOrgId ?? tenant?.id;
  const isCrossOrg =
    parsedQueryOrgId != null &&
    tenant?.id != null &&
    parsedQueryOrgId !== tenant.id;
  const fallbackBackHref = isCrossOrg
    ? `/internal/organizations/${parsedQueryOrgId}?section=id-cards`
    : HOME_HREF;
  const backHref = resolveEditorBackHref(
    searchParams.get("backHref"),
    fallbackBackHref,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const artboardRef = useRef<ArtboardHandle>(null);
  const [document, setDocument] = useState<IdCardDocument | null>(null);
  const [malformed, setMalformed] = useState(false);
  const [face, setFace] = useState<"front" | "back">("front");
  const [selectedId, setSelectedId] = useState<string | "page" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [undo, setUndo] = useState<IdCardDocument[]>([]);
  const [pendingFront, setPendingFront] = useState<File | null>(null);
  const [pendingBack, setPendingBack] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("Untitled");
  const [adjustBackground, setAdjustBackground] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const pendingFrontUrl = useMemo(
    () => (pendingFront ? URL.createObjectURL(pendingFront) : null),
    [pendingFront],
  );
  const pendingBackUrl = useMemo(
    () => (pendingBack ? URL.createObjectURL(pendingBack) : null),
    [pendingBack],
  );
  useEffect(
    () => () => {
      if (pendingFrontUrl) URL.revokeObjectURL(pendingFrontUrl);
    },
    [pendingFrontUrl],
  );
  useEffect(
    () => () => {
      if (pendingBackUrl) URL.revokeObjectURL(pendingBackUrl);
    },
    [pendingBackUrl],
  );

  const query = useQuery({
    queryKey: ["id-card-template", orgId, id],
    queryFn: () => fetchIdCardTemplate(orgId as number, id),
    enabled: orgId != null && Number.isFinite(id),
  });

  const template = query.data;

  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    setTemplateName(template.name?.trim() || "Untitled");

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    (async () => {
      try {
        let doc = idCardTemplateToDocument({
          width_in: template.width_in,
          height_in: template.height_in,
          background_url: template.background_url,
          slots: template.slots,
          back_background_url: template.back_background_url,
          back_slots: template.back_slots,
          background_transform: template.background_transform,
        });
        const pageIn = { width: doc.width, height: doc.height };

        for (const face of ["front", "back"] as const) {
          const url = doc.background[face].url;
          if (!url) continue;
          try {
            const img = await loadImage(url);
            const resolved = resolveIdCardBackgroundFill(
              url,
              doc.background[face],
              { width: img.width, height: img.height },
              pageIn,
            );
            if (
              resolved.scale !== doc.background[face].scale ||
              resolved.offsetX !== doc.background[face].offsetX ||
              resolved.offsetY !== doc.background[face].offsetY
            ) {
              doc = {
                ...doc,
                background: {
                  ...doc.background,
                  [face]: { ...resolved, url },
                },
              };
            }
          } catch {
            // Keep stored transform when the artwork cannot be loaded for fitting.
          }
        }

        if (!cancelled) {
          setMalformed(false);
          setDocument(doc);
          setDirty(false);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof MalformedTemplateError) {
          setMalformed(true);
          toast.add({ type: "error", title: "Could not open this template." });
          return;
        }
        throw error;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast once on load
  }, [template]);

  useEffect(() => {
    const url =
      face === "front"
        ? (pendingFrontUrl ?? document?.background.front.url)
        : (pendingBackUrl ?? document?.background.back.url);
    if (!url) {
      setImageSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => setImageSize({ width: img.width, height: img.height });
    img.src = url;
  }, [
    face,
    pendingFrontUrl,
    pendingBackUrl,
    document?.background.front.url,
    document?.background.back.url,
  ]);

  const commit = useCallback(
    (next: IdCardDocument) => {
      setUndo((stack) => (document ? [...stack, document] : stack));
      setDocument(next);
      setDirty(true);
    },
    [document],
  );

  const layers = document ? document.faces[face] : [];
  const selected = layers.find((layer) => layer.id === selectedId) ?? null;
  const isEditableTextLayer =
    selected?.type === "text" || selected?.type === "field";
  const isBold = isEditableTextLayer && selected.fontStyle === "bold";

  const save = useMutation({
    mutationFn: async () => {
      if (!document || orgId == null) throw new Error("missing document");
      const mapped = documentToIdCardPayload(document);
      return updateIdCardTemplate(orgId, id, {
        name: templateName,
        slots: normalizeQrSlots(mapped.slots as IdCardTemplateSlot[]),
        back_slots: normalizeQrSlots(mapped.back_slots as IdCardTemplateSlot[]),
        background_transform: mapped.background_transform,
        background: pendingFront ?? undefined,
        back_background: pendingBack ?? undefined,
      });
    },
    onSuccess: async (saved) => {
      if (saved) {
        setDocument(
          idCardTemplateToDocument({
            width_in: saved.width_in,
            height_in: saved.height_in,
            background_url: saved.background_url,
            slots: saved.slots,
            back_background_url: saved.back_background_url,
            back_slots: saved.back_slots,
            background_transform: saved.background_transform,
          }),
        );
        setTemplateName(saved.name?.trim() || "Untitled");
      }
      setDirty(false);
      setPendingFront(null);
      setPendingBack(null);
      toast.add({ title: "Template saved." });
      if (orgId != null) {
        await queryClient.invalidateQueries({
          queryKey: ["id-card-template", orgId, id],
        });
        await queryClient.invalidateQueries({
          queryKey: ["id-card-templates", orgId],
        });
      }
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not save template." });
    },
  });

  const goHome = () => {
    if (
      shouldConfirmClose({ dirty, userAccepted: false }) &&
      !window.confirm("Discard unsaved changes?")
    ) {
      return;
    }
    router.push(backHref);
  };

  const selectLayer = (id: string | "page" | null) => {
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!document || !selectedId || selectedId === "page") return;
    const next = removeLayer(layers, selectedId);
    if (next === layers) return;
    commit({ ...document, faces: { ...document.faces, [face]: next } });
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

  const chrome = useMemo(() => insertChromeForKind("id_card"), []);

  if (!Number.isFinite(id) || malformed || query.isError) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-300">Could not open this template.</p>
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "link" }), "mt-3")}
          onClick={(event) => {
            if (
              shouldConfirmClose({ dirty, userAccepted: false }) &&
              !window.confirm("Discard unsaved changes?")
            ) {
              event.preventDefault();
            }
          }}
        >
          Back
        </Link>
      </div>
    );
  }

  if (!document || query.isLoading || orgId == null) {
    return <p className="p-6 text-sm text-text-muted">Loading…</p>;
  }

  const updateLayer = (layerId: string, next: Layer) => {
    commit({
      ...document,
      faces: {
        ...document.faces,
        [face]: layers.map((layer) => (layer.id === layerId ? next : layer)),
      },
    });
  };

  const backgroundUrl =
    face === "front"
      ? (pendingFrontUrl ?? document.background.front.url)
      : (pendingBackUrl ?? document.background.back.url);

  const replaceBackground = (file: File) => {
    if (face === "front") setPendingFront(file);
    else setPendingBack(file);
    setDirty(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = { width: img.width, height: img.height };
      const page = { width: document.width, height: document.height };
      commit({
        ...document,
        background: {
          ...document.background,
          [face]: coverReplaceFill(url, size, page),
        },
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <EditorShell
      section="ID cards"
      title={templateName}
      onTitleChange={(next) => {
        setTemplateName(next);
        setDirty(true);
      }}
      backHref={backHref}
      onBack={goHome}
      onSave={() => save.mutate()}
      saveDisabled={save.isLoading}
      showPhoto={chrome.showPhoto}
      fieldItems={chrome.fieldItems}
      onAdd={(key) => {
        const sized = createIdCardLayer(key, layers.length);
        const layer = createIdCardLayer(
          key,
          layers.length,
          layerOriginForViewCenter({
            viewCenterDocument: artboardRef.current?.viewCenterDocument() ?? {
              x: document.width / 2,
              y: document.height / 2,
            },
            width: sized.width,
            height: sized.height,
          }),
        );
        commit({
          ...document,
          faces: { ...document.faces, [face]: [...layers, layer] },
        });
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
            kind="id_card"
            pagePreset={document.pagePreset}
            width={document.width}
            height={document.height}
            adjustBackground={adjustBackground}
            onPreset={(preset) => {
              if (!imageSize) return;
              commit(applyPagePreset(document, preset, imageSize) as IdCardDocument);
            }}
            onReplaceFile={replaceBackground}
            onToggleAdjust={() => {
              setAdjustBackground((value) => !value);
              setSelectedId("page");
            }}
          />
          {selected ? (
            <SelectedTextInspector
              layer={selected}
              onChange={(next) => updateLayer(selected.id, next)}
            />
          ) : null}
          {isEditableTextLayer ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
              <Checkbox
                checked={isBold}
                onCheckedChange={(checked) =>
                  updateLayer(selected.id, {
                    ...selected,
                    fontStyle: checked === true ? "bold" : "normal",
                  })
                }
              />
              Bold
            </label>
          ) : null}
        </div>
      }
      layers={
        <LayersPanel
          layers={layers}
          selectedId={selectedId}
          onSelect={selectLayer}
          onDelete={deleteSelected}
          label={(layer) => (layer.type === "field" ? layer.field : layer.type)}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <Artboard
            ref={artboardRef}
            page={pagePixelSize(document)}
            unitScale={document.dpi}
            fill={{
              ...document.background[face],
              url: backgroundUrl,
            }}
            layers={layers}
            selectedId={selectedId}
            adjustBackground={adjustBackground}
            onSelect={selectLayer}
            onChangeFill={(nextFill) =>
              commit({
                ...document,
                background: { ...document.background, [face]: nextFill },
              })
            }
            onChangeLayers={(nextLayers) =>
              commit({
                ...document,
                faces: { ...document.faces, [face]: nextLayers },
              })
            }
            onPickBackground={() => fileRef.current?.click()}
          />
        </div>
        <div className="flex justify-center gap-2 p-2">
          <Button
            type="button"
            variant={face === "front" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setFace("front");
              setSelectedId(null);
            }}
          >
            Front
          </Button>
          <Button
            type="button"
            variant={face === "back" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setFace("back");
              setSelectedId(null);
            }}
          >
            Back
          </Button>
        </div>
      </div>
    </EditorShell>
  );
}
