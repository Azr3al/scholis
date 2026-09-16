"use client";

import { Button } from "@/components/primitives";
import { EffectsToolbar } from "@/components/template-editor/effects-toolbar";
import { clampZoom, documentToScreen, screenToDocument, type Camera } from "@/lib/image-template/camera";
import { canvasFontFamily } from "@/lib/image-template/canvas-fonts";
import { clampBackgroundFill } from "@/lib/image-template/cover-fit";
import { backgroundDestRect } from "@/lib/image-template/composite";
import { resolveIdCardBackgroundFill } from "@/lib/id-card/resolve-background-fill";
import { canvasCursor, HANDLE_SCREEN_PX, handlePoints, handlesForLayer, hitTest } from "@/lib/image-template/hit-test";
import { editableTextLayerId } from "@/lib/image-template/inline-text-edit";
import {
  canvasFontCss,
  clipLayerRect,
  drawImagePlaceholder,
  drawTextBlock,
  editOverlayHalfLeadingPx,
  formatVariableLabel,
  isImageLayer,
  isTextLike,
  isVariableLayer,
  layerFontSizePx,
  layerTextColor,
  measureLayerTextWidth,
  photoClipRadiusPx,
  textLineHeightPx,
  textStyleFlags,
} from "@/lib/image-template/layer-style";
import {
  bringForward,
  bringToFront,
  isEditorTypingTarget,
  sendBackward,
  sendToBack,
} from "@/lib/image-template/layer-stack";
import { reducePointer, type PointerState } from "@/lib/image-template/pointer-session";
import { applyInlineText } from "@/lib/image-template/scale-text-on-resize";
import type { BackgroundFill, Layer } from "@/lib/image-template/types";
import {
  applyBraceSuggestion,
  braceSuggestQuery,
  filterVariableOptions,
  variableTemplate,
} from "@/lib/image-template/variable-template";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type ArtboardHandle = {
  viewCenterDocument: () => { x: number; y: number };
};

export type ArtboardProps = {
  page: { width: number; height: number };
  fill: BackgroundFill;
  layers: Layer[];
  selectedId: string | "page" | null;
  adjustBackground?: boolean;
  unitScale?: number;
  onSelect: (id: string | "page" | null) => void;
  onChangeFill: (fill: BackgroundFill) => void;
  onChangeLayers: (layers: Layer[]) => void;
  onPickBackground: () => void;
};

function fitCamera(
  page: { width: number; height: number },
  view: { width: number; height: number },
  padding = 48,
): Camera {
  if (page.width <= 0 || page.height <= 0 || view.width <= 0 || view.height <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const zoom = clampZoom(
    Math.min(
      (view.width - padding * 2) / page.width,
      (view.height - padding * 2) / page.height,
    ),
  );
  return {
    zoom,
    x: (view.width - page.width * zoom) / 2,
    y: (view.height - page.height * zoom) / 2,
  };
}

function toPixelFill(fill: BackgroundFill, unitScale: number): BackgroundFill {
  return {
    ...fill,
    offsetX: fill.offsetX * unitScale,
    offsetY: fill.offsetY * unitScale,
    scale: fill.scale * unitScale,
  };
}

function fromPixelFill(fill: BackgroundFill, unitScale: number): BackgroundFill {
  return {
    ...fill,
    offsetX: fill.offsetX / unitScale,
    offsetY: fill.offsetY / unitScale,
    scale: fill.scale / unitScale,
  };
}

function toPixelLayers(layers: Layer[], unitScale: number): Layer[] {
  if (unitScale === 1) return layers;
  return layers.map((layer) => ({
    ...layer,
    x: layer.x * unitScale,
    y: layer.y * unitScale,
    width: layer.width * unitScale,
    height: layer.height * unitScale,
  }));
}

function fromPixelLayers(layers: Layer[], unitScale: number): Layer[] {
  if (unitScale === 1) return layers;
  return layers.map((layer) => ({
    ...layer,
    x: layer.x / unitScale,
    y: layer.y / unitScale,
    width: layer.width / unitScale,
    height: layer.height / unitScale,
  }));
}

function resolveIdCardFillForArtboard(
  fill: BackgroundFill,
  bgImage: HTMLImageElement | null,
  page: { width: number; height: number },
  unitScale: number,
): BackgroundFill {
  if (unitScale <= 1 || !bgImage) return fill;
  return resolveIdCardBackgroundFill(
    fill.url,
    fill,
    { width: bgImage.width, height: bgImage.height },
    { width: page.width / unitScale, height: page.height / unitScale },
  );
}

function layerLabel(layer: Layer): string {
  const token = formatVariableLabel(layer);
  if (token) return token;
  if (layer.type === "text") return layer.text;
  if (layer.type === "field") return layer.field;
  if (layer.type === "named_person") return "Named person";
  if (layer.type === "signature") return "Signature";
  if (layer.type === "photo") return "Photo";
  if (layer.type === "qr") return "QR";
  return "Layer";
}

export const Artboard = forwardRef<ArtboardHandle, ArtboardProps>(function Artboard(
  {
    page,
    fill,
    layers,
    selectedId,
    adjustBackground = false,
    unitScale = 1,
    onSelect,
    onChangeFill,
    onChangeLayers,
    onPickBackground,
  },
  ref,
) {
  const pasteboardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spaceRef = useRef(false);
  const pointerRef = useRef<PointerState | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const fittedKey = useRef<string>("");
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [draft, setDraft] = useState<{ fill: BackgroundFill; layers: Layer[] } | null>(
    null,
  );
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [textEdit, setTextEdit] = useState<{ id: string; text: string } | null>(null);
  const [editCaret, setEditCaret] = useState(0);
  const [braceHighlight, setBraceHighlight] = useState(0);
  const textEditRef = useRef<{ id: string; text: string } | null>(null);
  const textEditSnapshotRef = useRef<Layer | null>(null);
  textEditRef.current = textEdit;

  const liveFill = draft?.fill ?? fill;
  const liveLayers = draft?.layers ?? layers;
  const empty = page.width <= 0 || page.height <= 0 || !liveFill.url;

  cameraRef.current = camera;

  useImperativeHandle(ref, () => ({
    viewCenterDocument: () => {
      const view = pasteboardRef.current?.getBoundingClientRect();
      const point = screenToDocument(cameraRef.current, {
        x: (view?.width ?? 0) / 2,
        y: (view?.height ?? 0) / 2,
      });
      return { x: point.x / unitScale, y: point.y / unitScale };
    },
  }));

  useEffect(() => {
    if (!liveFill.url) {
      setBgImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setBgImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setBgImage(null);
    };
    img.src = liveFill.url;
    return () => {
      cancelled = true;
    };
  }, [liveFill.url]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceRef.current = event.type === "keydown";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditorTypingTarget(event) || !(event.metaKey || event.ctrlKey)) return;
      if (event.key !== "[" && event.key !== "]") return;
      if (!selectedId || selectedId === "page") return;
      event.preventDefault();
      const next =
        event.key === "]"
          ? event.altKey
            ? bringToFront(liveLayers, selectedId)
            : bringForward(liveLayers, selectedId)
          : event.altKey
            ? sendToBack(liveLayers, selectedId)
            : sendBackward(liveLayers, selectedId);
      if (next !== liveLayers) onChangeLayers(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveLayers, onChangeLayers, selectedId]);

  const applyFit = useCallback(() => {
    const view = pasteboardRef.current?.getBoundingClientRect();
    if (!view) return;
    const next = fitCamera(page, { width: view.width, height: view.height });
    setCamera(next);
  }, [page]);

  useLayoutEffect(() => {
    const node = pasteboardRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setViewSize({ width: rect.width, height: rect.height });
      const pageKey = `${page.width}x${page.height}`;
      if (fittedKey.current !== pageKey && page.width > 0 && page.height > 0 && rect.width > 0) {
        fittedKey.current = pageKey;
        setCamera(fitCamera(page, { width: rect.width, height: rect.height }));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [page.width, page.height]);

  const canvasPoint = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const pixelState = (): Omit<PointerState, "mode"> & { mode: PointerState["mode"] } => {
    const adjusting = adjustBackground || selectedId === "page";
    const fillForBackground =
      unitScale > 1 && bgImage && adjusting
        ? resolveIdCardFillForArtboard(liveFill, bgImage, page, unitScale)
        : liveFill;
    return {
      mode: pointerRef.current?.mode ?? "idle",
      camera: cameraRef.current,
      fill: toPixelFill(fillForBackground, unitScale),
      layers: toPixelLayers(liveLayers, unitScale),
      selectedId: selectedId === "page" ? "page" : selectedId,
      page,
      unitScale,
      geometryInPixels: unitScale > 1,
      adjustBackground: adjusting,
      lastPoint: pointerRef.current?.lastPoint,
      handle: pointerRef.current?.handle,
      resizeOrigin: pointerRef.current?.resizeOrigin,
      moveOrigin: pointerRef.current?.moveOrigin,
      gestureOrigin: pointerRef.current?.gestureOrigin,
      guides: pointerRef.current?.guides,
    };
  };

  const publish = (next: PointerState, commit: boolean) => {
    pointerRef.current = next;
    setCamera(next.camera);
    const native = {
      fill: fromPixelFill(next.fill, unitScale),
      layers: fromPixelLayers(next.layers, unitScale),
    };
    if (next.selectedId !== (selectedId === "page" ? "page" : selectedId)) {
      onSelect(next.selectedId === "page" ? "page" : next.selectedId);
    }
    if (commit) {
      if (native.fill !== liveFill && JSON.stringify(native.fill) !== JSON.stringify(fill)) {
        onChangeFill(native.fill);
      }
      if (JSON.stringify(native.layers) !== JSON.stringify(layers)) {
        onChangeLayers(native.layers);
      }
      setDraft(null);
      return;
    }
    setDraft(native);
  };

  const fitEditingLayer = (current: Layer, text: string): Layer => {
    const origin = textEditSnapshotRef.current ?? current;
    const base = {
      ...current,
      x: origin.x,
      y: origin.y,
      width: origin.width,
      height: origin.height,
    };
    return applyInlineText(base, text, (value) =>
      measureLayerTextWidth(current, unitScale, value),
    unitScale);
  };

  const finishTextEdit = (save: boolean) => {
    const editing = textEditRef.current;
    const snapshot = textEditSnapshotRef.current;
    if (!editing) return;
    textEditRef.current = null;
    textEditSnapshotRef.current = null;
    setTextEdit(null);
    if (!save) {
      if (!snapshot) return;
      onChangeLayers(
        liveLayers.map((layer) => (layer.id === snapshot.id ? snapshot : layer)),
      );
      return;
    }
    const current = liveLayers.find((layer) => layer.id === editing.id);
    if (!current || !isTextLike(current)) return;
    const next = fitEditingLayer(current, editing.text);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    onChangeLayers(
      liveLayers.map((layer) => (layer.id === editing.id ? next : layer)),
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (textEditRef.current) {
      finishTextEdit(true);
      return;
    }
    if (event.detail >= 2) {
      const point = canvasPoint(event);
      const state = pixelState();
      const hit = hitTest({
        layers: state.layers,
        page,
        camera: state.camera,
        point,
        selectedId: selectedId === "page" ? null : selectedId,
      });
      const layerId = editableTextLayerId(hit, state.layers);
      if (layerId) onSelect(layerId);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    const state = pixelState();
    const hit = hitTest({
      layers: state.layers,
      page,
      camera: state.camera,
      point,
      selectedId: selectedId === "page" ? null : selectedId,
    });
    const next = reducePointer(state, {
      type: "down",
      point,
      spaceKey: spaceRef.current,
      hit,
    });
    publish(next, false);
  };

  const onDoubleClick = (event: { clientX: number; clientY: number }) => {
    const point = canvasPoint(event);
    const state = pixelState();
    const hit = hitTest({
      layers: state.layers,
      page,
      camera: state.camera,
      point,
      selectedId: selectedId === "page" ? null : selectedId,
    });
    const layerId = editableTextLayerId(hit, liveLayers);
    if (!layerId) return;
    const layer = liveLayers.find((item) => item.id === layerId);
    if (!layer || !isTextLike(layer)) return;
    onSelect(layerId);
    textEditSnapshotRef.current = layer;
    const initial = layer.type === "text" ? layer.text : variableTemplate(layer);
    setTextEdit({ id: layerId, text: initial });
    setEditCaret(initial.length);
    setBraceHighlight(0);
  };

  const applyCursor = (
    canvas: HTMLCanvasElement,
    point: { x: number; y: number },
    state: PointerState,
  ) => {
    const hit = hitTest({
      layers: state.layers,
      page,
      camera: state.camera,
      point,
      selectedId: selectedId === "page" ? null : selectedId,
    });
    canvas.style.cursor = canvasCursor({
      hit,
      spaceKey: spaceRef.current,
      mode: state.mode,
      handle: state.handle,
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const state = pixelState();
    applyCursor(event.currentTarget, point, pointerRef.current ?? state);
    if (!pointerRef.current || pointerRef.current.mode === "idle") return;
    const next = reducePointer(state, {
      type: "move",
      point,
      spaceKey: spaceRef.current,
    });
    if (next.mode === "adjust" && bgImage) {
      next.fill = clampBackgroundFill(
        next.fill,
        { width: bgImage.width, height: bgImage.height },
        page,
      );
    }
    publish(next, false);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const next = reducePointer(pixelState(), {
      type: "up",
      point: canvasPoint(event),
      spaceKey: spaceRef.current,
    });
    publish(next, true);
  };

  useEffect(() => {
    const node = pasteboardRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = canvasPoint(event);
      if (event.ctrlKey || event.metaKey) {
        const old = cameraRef.current;
        const factor = event.deltaY > 0 ? 0.9 : 1.1;
        const zoom = clampZoom(old.zoom * factor);
        const doc = screenToDocument(old, point);
        setCamera({
          zoom,
          x: point.x - doc.x * zoom,
          y: point.y - doc.y * zoom,
        });
        return;
      }
      if ((adjustBackground || selectedId === "page") && bgImage) {
        const factor = event.deltaY > 0 ? 0.95 : 1.05;
        const inchFill = resolveIdCardFillForArtboard(liveFill, bgImage, page, unitScale);
        const pixel = toPixelFill(inchFill, unitScale);
        onChangeFill(
          fromPixelFill(
            clampBackgroundFill(
              { ...pixel, scale: pixel.scale * factor },
              { width: bgImage.width, height: bgImage.height },
              page,
            ),
            unitScale,
          ),
        );
        return;
      }
      setCamera((current) => ({
        ...current,
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      }));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [adjustBackground, bgImage, liveFill, onChangeFill, page, selectedId, unitScale]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = viewSize.width;
    const cssH = viewSize.height;
    if (cssW <= 0 || cssH <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const cam = camera;
    const pageOrigin = documentToScreen(cam, { x: 0, y: 0 });
    const pageW = page.width * cam.zoom;
    const pageH = page.height * cam.zoom;

    if (page.width > 0 && page.height > 0) {
      ctx.fillStyle = "#f7f3ea";
      ctx.fillRect(pageOrigin.x, pageOrigin.y, pageW, pageH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(pageOrigin.x, pageOrigin.y, pageW, pageH);
      ctx.clip();
      if (bgImage) {
        const fillForDraw = resolveIdCardFillForArtboard(liveFill, bgImage, page, unitScale);
        const dest = backgroundDestRect(
          toPixelFill(fillForDraw, unitScale),
          { width: bgImage.width, height: bgImage.height },
          page,
        );
        const destOrigin = documentToScreen(cam, { x: dest.x, y: dest.y });
        ctx.drawImage(
          bgImage,
          destOrigin.x,
          destOrigin.y,
          dest.width * cam.zoom,
          dest.height * cam.zoom,
        );
      }
      const pixelLayers = toPixelLayers(liveLayers, unitScale);
      for (const layer of [...pixelLayers].sort((a, b) => a.z - b.z)) {
        const source = liveLayers.find((item) => item.id === layer.id) ?? layer;
        const origin = documentToScreen(cam, { x: layer.x, y: layer.y });
        const w = layer.width * cam.zoom;
        const h = layer.height * cam.zoom;
        const rect = { x: origin.x, y: origin.y, width: w, height: h };
        const radius = photoClipRadiusPx(source, unitScale) * cam.zoom;
        ctx.save();
        if (!isVariableLayer(source)) {
          clipLayerRect(ctx, rect, radius);
        }
        if (isTextLike(source)) {
          const fontSize = layerFontSizePx(source, unitScale, cam.zoom);
          const copy =
            textEdit?.id === source.id ? textEdit.text : layerLabel(source);
          drawTextBlock(
            ctx,
            source,
            rect,
            copy,
            canvasFontCss(source, unitScale, cam.zoom),
            fontSize,
          );
        } else if (isImageLayer(source)) {
          drawImagePlaceholder(ctx, rect);
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(origin.x, origin.y, w, h);
          ctx.strokeStyle = "rgba(17, 17, 17, 0.55)";
          ctx.lineWidth = 1;
          ctx.strokeRect(origin.x, origin.y, w, h);
          ctx.fillStyle = "#111111";
          ctx.font = `${Math.max(11, 13 * Math.min(cam.zoom, 2))}px "Noto Sans", sans-serif`;
          ctx.textBaseline = "top";
          ctx.fillText(layerLabel(source), origin.x + 6, origin.y + 6);
        }
        ctx.restore();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(247, 243, 234, 0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(pageOrigin.x, pageOrigin.y, pageW, pageH);
    }

    const selected =
      selectedId && selectedId !== "page"
        ? toPixelLayers(liveLayers, unitScale).find((layer) => layer.id === selectedId)
        : null;
    if (selected) {
      const origin = documentToScreen(cam, { x: selected.x, y: selected.y });
      ctx.strokeStyle = "#3d8f72";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        origin.x,
        origin.y,
        selected.width * cam.zoom,
        selected.height * cam.zoom,
      );
      const points = handlePoints(selected);
      ctx.fillStyle = "#f7f3ea";
      ctx.strokeStyle = "#3d8f72";
      for (const id of handlesForLayer(selected)) {
        const screen = documentToScreen(cam, points[id]);
        ctx.fillRect(
          screen.x - HANDLE_SCREEN_PX / 2,
          screen.y - HANDLE_SCREEN_PX / 2,
          HANDLE_SCREEN_PX,
          HANDLE_SCREEN_PX,
        );
        ctx.strokeRect(
          screen.x - HANDLE_SCREEN_PX / 2,
          screen.y - HANDLE_SCREEN_PX / 2,
          HANDLE_SCREEN_PX,
          HANDLE_SCREEN_PX,
        );
      }
    } else if (selectedId === "page" && page.width > 0) {
      ctx.strokeStyle = "#3d8f72";
      ctx.lineWidth = 2;
      ctx.strokeRect(pageOrigin.x, pageOrigin.y, pageW, pageH);
    }

    const guides = pointerRef.current?.guides;
    if (guides && page.width > 0 && page.height > 0) {
      ctx.strokeStyle = "#c45c26";
      ctx.lineWidth = 1;
      for (const x of guides.xs) {
        const top = documentToScreen(cam, { x, y: 0 });
        const bottom = documentToScreen(cam, { x, y: page.height });
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
      }
      for (const y of guides.ys) {
        const left = documentToScreen(cam, { x: 0, y });
        const right = documentToScreen(cam, { x: page.width, y });
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
      }
    }
  }, [bgImage, camera, draft, liveFill, liveLayers, page, selectedId, textEdit, unitScale, viewSize]);

  const selectedLayer =
    selectedId && selectedId !== "page"
      ? liveLayers.find((layer) => layer.id === selectedId) ?? null
      : null;
  const editingLayer = textEdit
    ? toPixelLayers(liveLayers, unitScale).find((item) => item.id === textEdit.id)
    : null;
  const editingOrigin = editingLayer
    ? documentToScreen(camera, { x: editingLayer.x, y: editingLayer.y })
    : null;
  const editFontPx =
    selectedLayer && isTextLike(selectedLayer)
      ? layerFontSizePx(selectedLayer, unitScale, camera.zoom)
      : 0;
  const editHalfLeading = editOverlayHalfLeadingPx(editFontPx);
  const braceQuery = textEdit ? braceSuggestQuery(textEdit.text, editCaret) : null;
  const braceOptions = braceQuery ? filterVariableOptions(braceQuery.query) : [];

  const applyEditText = (nextText: string, caret = nextText.length) => {
    if (!textEdit) return;
    setTextEdit({ id: textEdit.id, text: nextText });
    setEditCaret(caret);
    const current = liveLayers.find((layer) => layer.id === textEdit.id);
    if (!current || !isTextLike(current)) return;
    const next = fitEditingLayer(current, nextText);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    onChangeLayers(liveLayers.map((layer) => (layer.id === textEdit.id ? next : layer)));
  };

  return (
    <div ref={pasteboardRef} className="relative h-full min-h-0 w-full bg-surface-sunken">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(event) => {
          event.currentTarget.style.cursor = "default";
        }}
        onDoubleClick={onDoubleClick}
      />
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <EffectsToolbar
          layer={selectedLayer}
          layers={liveLayers}
          unitScale={unitScale}
          onChange={(next) =>
            onChangeLayers(liveLayers.map((layer) => (layer.id === next.id ? next : layer)))
          }
          onChangeLayers={onChangeLayers}
        />
      </div>
      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="pointer-events-auto"
            onClick={onPickBackground}
          >
            Add background
          </Button>
        </div>
      ) : null}
      {textEdit && editingLayer && editingOrigin && selectedLayer && isTextLike(selectedLayer) ? (
        <div
          className="absolute z-20"
          style={{
            left: editingOrigin.x,
            top: editingOrigin.y - editHalfLeading,
          }}
        >
          <textarea
            aria-label="Layer text"
            rows={1}
            className="block appearance-none resize-none overflow-hidden border-0 bg-transparent p-0 outline-none selection:bg-[rgba(61,143,114,0.35)] selection:text-transparent"
            style={{
              width: Math.max(24, editingLayer.width * camera.zoom),
              height: Math.max(24, editingLayer.height * camera.zoom) + editHalfLeading,
              fontSize: editFontPx,
              lineHeight: `${textLineHeightPx(editFontPx)}px`,
              fontFamily: `"${canvasFontFamily(selectedLayer.fontFamily)}", sans-serif`,
              fontWeight: textStyleFlags(selectedLayer).bold ? 700 : 400,
              fontStyle: textStyleFlags(selectedLayer).italic ? "italic" : "normal",
              color: "transparent",
              WebkitTextFillColor: "transparent",
              caretColor: layerTextColor(selectedLayer),
              textAlign: selectedLayer.align ?? "left",
              whiteSpace: "pre-wrap",
              overflowWrap: "normal",
              wordBreak: "normal",
            }}
            value={textEdit.text}
            autoFocus
            onChange={(event) => {
              setBraceHighlight(0);
              applyEditText(
                event.target.value,
                event.target.selectionStart ?? event.target.value.length,
              );
            }}
            onSelect={(event) => {
              setEditCaret(event.currentTarget.selectionStart ?? textEdit.text.length);
            }}
            onBlur={() => finishTextEdit(true)}
            onKeyDown={(event) => {
              const caret =
                (event.target as HTMLTextAreaElement).selectionStart ?? textEdit.text.length;
              if (braceQuery && event.key === "ArrowDown") {
                event.preventDefault();
                setBraceHighlight((index) =>
                  Math.min(index + 1, Math.max(0, braceOptions.length - 1)),
                );
                return;
              }
              if (braceQuery && event.key === "ArrowUp") {
                event.preventDefault();
                setBraceHighlight((index) => Math.max(index - 1, 0));
                return;
              }
              if (braceQuery && event.key === "Enter" && braceOptions[braceHighlight]) {
                event.preventDefault();
                const next = applyBraceSuggestion(
                  textEdit.text,
                  caret,
                  braceOptions[braceHighlight].key,
                );
                applyEditText(next.text, next.caret);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finishTextEdit(false);
              }
            }}
          />
          {braceQuery && braceOptions.length > 0 ? (
            <ul
              role="listbox"
              aria-label="Variables"
              className="mt-1 max-h-48 w-56 overflow-auto rounded-md border border-border bg-surface-elevated py-1 shadow-md"
            >
              {braceOptions.map((item, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === braceHighlight}
                    className={`flex w-full px-2 py-1.5 text-left text-sm ${
                      index === braceHighlight
                        ? "bg-accent text-accent-foreground"
                        : "text-text-primary"
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const next = applyBraceSuggestion(textEdit.text, editCaret, item.key);
                      applyEditText(next.text, next.caret);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-surface-elevated px-2 py-1 text-sm text-text-primary">
        <Button type="button" variant="ghost" size="sm" onClick={applyFit}>
          Fit
        </Button>
        <span>{Math.round(camera.zoom * 100)}%</span>
      </div>
    </div>
  );
});
