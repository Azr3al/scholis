import { documentToScreen, screenToDocument, type Camera } from "./camera";
import type { Layer } from "./types";

export const HANDLE_SCREEN_PX = 10;

export type HandleId = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type Hit =
  | { kind: "handle"; layerId: string; handle: HandleId }
  | { kind: "layer"; layerId: string }
  | { kind: "page" }
  | { kind: "none" };

export function handlesForLayer(layer: Layer): HandleId[] {
  if (layer.type === "text" || layer.type === "field" || layer.type === "named_person") {
    return ["nw", "ne", "e", "se", "sw", "w"];
  }
  return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
}

export function handlePoints(layer: Layer): Record<HandleId, { x: number; y: number }> {
  const { x, y, width, height } = layer;
  return {
    nw: { x, y },
    n: { x: x + width / 2, y },
    ne: { x: x + width, y },
    e: { x: x + width, y: y + height / 2 },
    se: { x: x + width, y: y + height },
    s: { x: x + width / 2, y: y + height },
    sw: { x, y: y + height },
    w: { x, y: y + height / 2 },
  };
}

export function hitTest(args: {
  layers: Layer[];
  page: { width: number; height: number };
  camera: Camera;
  point: { x: number; y: number };
  selectedId?: string | null;
}): Hit {
  const { layers, page, camera, point, selectedId } = args;
  const docPoint = screenToDocument(camera, point);
  const half = HANDLE_SCREEN_PX / 2;
  if (selectedId) {
    const selected = layers.find((layer) => layer.id === selectedId);
    if (selected) {
        const points = handlePoints(selected);
        for (const handle of handlesForLayer(selected)) {
          const corner = points[handle];
          const screen = documentToScreen(camera, corner);
          if (
            Math.abs(point.x - screen.x) <= half &&
            Math.abs(point.y - screen.y) <= half
          ) {
            return { kind: "handle", layerId: selected.id, handle };
          }
        }
    }
  }
  const top = [...layers].sort((a, b) => b.z - a.z);
  for (const layer of top) {
    if (
      docPoint.x >= layer.x &&
      docPoint.x <= layer.x + layer.width &&
      docPoint.y >= layer.y &&
      docPoint.y <= layer.y + layer.height
    ) {
      return { kind: "layer", layerId: layer.id };
    }
  }
  if (
    docPoint.x >= 0 &&
    docPoint.x <= page.width &&
    docPoint.y >= 0 &&
    docPoint.y <= page.height
  ) {
    return { kind: "page" };
  }
  return { kind: "none" };
}

export type CursorMode = "idle" | "pan" | "adjust" | "move" | "resize";

export function cursorForHit(hit: Hit): string {
  if (hit.kind !== "handle") {
    if (hit.kind === "layer") return "move";
    return "default";
  }
  const { handle } = hit;
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  return "ns-resize";
}

export function canvasCursor(args: {
  hit: Hit;
  spaceKey: boolean;
  mode: CursorMode;
  handle?: HandleId;
}): string {
  if (args.spaceKey) return args.mode === "pan" ? "grabbing" : "grab";
  if (args.mode === "resize" && args.handle) {
    return cursorForHit({ kind: "handle", layerId: "", handle: args.handle });
  }
  if (args.mode === "move") return "move";
  return cursorForHit(args.hit);
}
