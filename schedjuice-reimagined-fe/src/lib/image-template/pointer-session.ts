import type { Camera } from "./camera";
import type { HandleId, Hit } from "./hit-test";
import { raiseLayer } from "./layer-stack";
import { scaleTextOnResize } from "./scale-text-on-resize";
import {
  mergeSnapTargets,
  pageSnapTargets,
  siblingSnapTargets,
  SNAP_SCREEN_PX,
  snapMove,
  snapResize,
  type SnapGuides,
} from "./snap";
import type { BackgroundFill, Layer } from "./types";

export type PointerMode = "idle" | "pan" | "adjust" | "move" | "resize";

export type PointerState = {
  mode: PointerMode;
  camera: Camera;
  fill: BackgroundFill;
  layers: Layer[];
  selectedId: string | null;
  adjustBackground?: boolean;
  page?: { width: number; height: number };
  unitScale?: number;
  geometryInPixels?: boolean;
  lastPoint?: { x: number; y: number };
  handle?: HandleId;
  resizeOrigin?: Layer;
  moveOrigin?: Layer;
  gestureOrigin?: { x: number; y: number };
  guides?: SnapGuides;
};

export type PointerEvent = {
  type: "down" | "move" | "up";
  point: { x: number; y: number };
  spaceKey: boolean;
  hit?: Hit;
};

const MIN_SIZE = 8;

function applyResize(
  layer: Layer,
  handle: HandleId,
  dx: number,
  dy: number,
  unitScale = 1,
  geometryInPixels = false,
): Layer {
  let { x, y, width, height } = layer;
  if (handle === "e" || handle === "ne" || handle === "se") width += dx;
  if (handle === "w" || handle === "nw" || handle === "sw") {
    x += dx;
    width -= dx;
  }
  if (handle === "s" || handle === "se" || handle === "sw") height += dy;
  if (handle === "n" || handle === "ne" || handle === "nw") {
    y += dy;
    height -= dy;
  }
  if (width < MIN_SIZE) {
    if (handle.includes("w")) x -= MIN_SIZE - width;
    width = MIN_SIZE;
  }
  if (height < MIN_SIZE) {
    if (handle.includes("n")) y -= MIN_SIZE - height;
    height = MIN_SIZE;
  }
  return scaleTextOnResize(
    layer,
    { ...layer, x, y, width, height },
    handle,
    undefined,
    unitScale,
    geometryInPixels,
  );
}

export function reducePointer(state: PointerState, event: PointerEvent): PointerState {
  if (event.type === "down") {
    if (event.spaceKey) {
      return {
        ...state,
        mode: "pan",
        lastPoint: event.point,
        handle: undefined,
        guides: undefined,
      };
    }
    if (event.hit && event.hit.kind === "handle") {
      const hit = event.hit;
      const layers = raiseLayer(state.layers, hit.layerId);
      return {
        ...state,
        layers,
        mode: "resize",
        selectedId: hit.layerId,
        handle: hit.handle,
        lastPoint: event.point,
        resizeOrigin: layers.find((layer) => layer.id === hit.layerId),
        gestureOrigin: event.point,
        guides: undefined,
      };
    }
    if (event.hit && event.hit.kind === "layer") {
      const hit = event.hit;
      const layers = raiseLayer(state.layers, hit.layerId);
      return {
        ...state,
        layers,
        mode: "move",
        selectedId: hit.layerId,
        handle: undefined,
        lastPoint: event.point,
        moveOrigin: layers.find((layer) => layer.id === hit.layerId),
        gestureOrigin: event.point,
        guides: undefined,
      };
    }
    if (!event.hit || event.hit.kind === "page") {
      return {
        ...state,
        mode: event.hit?.kind === "page" ? "adjust" : "idle",
        selectedId: event.hit?.kind === "page" ? "page" : null,
        handle: undefined,
        lastPoint: event.point,
        guides: undefined,
      };
    }
    return {
      ...state,
      mode: "idle",
      selectedId: null,
      handle: undefined,
      lastPoint: event.point,
      guides: undefined,
    };
  }
  if (event.type === "up") {
    return {
      ...state,
      mode: "idle",
      lastPoint: undefined,
      handle: undefined,
      resizeOrigin: undefined,
      moveOrigin: undefined,
      gestureOrigin: undefined,
      guides: undefined,
    };
  }
  const last = state.lastPoint;
  if (!last) return state;
  const dx = event.point.x - last.x;
  const dy = event.point.y - last.y;
  if (state.mode === "pan") {
    return {
      ...state,
      camera: { ...state.camera, x: state.camera.x + dx, y: state.camera.y + dy },
      lastPoint: event.point,
      guides: undefined,
    };
  }
  const zoom = state.camera.zoom || 1;
  const docDx = dx / zoom;
  const docDy = dy / zoom;
  if (state.mode === "adjust") {
    return {
      ...state,
      fill: {
        ...state.fill,
        offsetX: state.fill.offsetX + docDx,
        offsetY: state.fill.offsetY + docDy,
      },
      lastPoint: event.point,
      guides: undefined,
    };
  }
  if (state.mode === "move" && state.selectedId && state.selectedId !== "page") {
    const start = state.gestureOrigin;
    const totalDx = start ? (event.point.x - start.x) / zoom : docDx;
    const totalDy = start ? (event.point.y - start.y) / zoom : docDy;
    const targets = mergeSnapTargets(
      pageSnapTargets(state.page ?? { width: 0, height: 0 }),
      siblingSnapTargets(state.layers, state.selectedId),
    );
    const threshold = SNAP_SCREEN_PX / zoom;
    let guides: SnapGuides = { xs: [], ys: [] };
    return {
      ...state,
      layers: state.layers.map((layer) => {
        if (layer.id !== state.selectedId) return layer;
        const origin = state.moveOrigin ?? layer;
        const unconstrained = { ...layer, x: origin.x + totalDx, y: origin.y + totalDy };
        const snapped = snapMove(unconstrained, targets, threshold);
        guides = snapped.guides;
        return snapped.rect;
      }),
      guides,
      lastPoint: event.point,
    };
  }
  if (
    state.mode === "resize" &&
    state.handle &&
    state.selectedId &&
    state.selectedId !== "page"
  ) {
    const origin = state.resizeOrigin;
    const start = state.gestureOrigin;
    const totalDx = start ? (event.point.x - start.x) / zoom : docDx;
    const totalDy = start ? (event.point.y - start.y) / zoom : docDy;
    const targets = mergeSnapTargets(
      pageSnapTargets(state.page ?? { width: 0, height: 0 }),
      siblingSnapTargets(state.layers, state.selectedId),
    );
    const threshold = SNAP_SCREEN_PX / zoom;
    let guides: SnapGuides = { xs: [], ys: [] };
    const unitScale = state.unitScale ?? 1;
    const geometryInPixels = state.geometryInPixels ?? false;
    return {
      ...state,
      layers: state.layers.map((layer) => {
        if (layer.id !== state.selectedId) return layer;
        const resized = applyResize(
          origin ?? layer,
          state.handle as HandleId,
          totalDx,
          totalDy,
          unitScale,
          geometryInPixels,
        );
        const snapped = snapResize(resized, state.handle as HandleId, targets, threshold);
        guides = snapped.guides;
        return scaleTextOnResize(
          origin ?? layer,
          snapped.rect,
          state.handle as HandleId,
          undefined,
          unitScale,
          geometryInPixels,
        );
      }),
      guides,
      lastPoint: event.point,
    };
  }
  return { ...state, lastPoint: event.point };
}
