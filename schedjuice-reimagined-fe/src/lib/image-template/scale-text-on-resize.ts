import type { HandleId } from "./hit-test";
import { fitCopyLayer, measureTextInLayerUnits, reflowTextLayer } from "./layer-style";
import type { Layer } from "./types";

const MIN_FONT = 8;

function isTextLike(
  layer: Layer,
): layer is Extract<Layer, { type: "text" | "field" | "named_person" }> {
  return layer.type === "text" || layer.type === "field" || layer.type === "named_person";
}

function reflowMeasure(
  layer: Layer,
  unitScale: number,
  geometryInPixels: boolean,
): ((text: string) => number) | undefined {
  if (unitScale === 1) return undefined;
  return (text) => measureTextInLayerUnits(layer, unitScale, text, geometryInPixels);
}

export function applyFontSize(layer: Layer, nextSize: number, unitScale = 1): Layer {
  if (!isTextLike(layer)) return layer;
  const fontSize = Math.max(MIN_FONT, nextSize);
  const sized = { ...layer, fontSize };
  return reflowTextLayer(sized, reflowMeasure(sized, unitScale, false), "align", unitScale);
}

export function applyInlineText(
  layer: Layer,
  text: string,
  measure?: (value: string) => number,
  unitScale = 1,
): Layer {
  if (layer.type === "field" || layer.type === "named_person") {
    return fitCopyLayer({ ...layer, template: text }, measure, unitScale);
  }
  if (layer.type !== "text") return layer;
  return fitCopyLayer({ ...layer, text }, measure, unitScale);
}

function isCorner(handle?: HandleId): boolean {
  return handle === "ne" || handle === "nw" || handle === "se" || handle === "sw";
}

export function scaleTextOnResize(
  prev: Layer,
  next: Layer,
  handle?: HandleId,
  measure?: (value: string) => number,
  unitScale = 1,
  geometryInPixels = false,
): Layer {
  if (!isTextLike(prev) || !isTextLike(next)) return next;
  const sized = { ...next, fontSize: prev.fontSize ?? next.fontSize };
  const measureFn = measure ?? reflowMeasure(sized, unitScale, geometryInPixels);
  if (!isCorner(handle)) {
    const pin = handle === "w" ? "right" : handle === "e" ? "left" : "align";
    return reflowTextLayer(sized, measureFn, pin, unitScale, geometryInPixels);
  }
  const base =
    typeof prev.fontSize === "number" && prev.fontSize > 0
      ? prev.fontSize
      : prev.height * 0.6;
  const oldDiag = Math.hypot(prev.width, prev.height);
  const newDiag = Math.hypot(next.width, next.height);
  if (oldDiag <= 0 || newDiag <= 0) return next;
  const factor = newDiag / oldDiag;
  const width = prev.width * factor;
  const height = prev.height * factor;
  const fontSize = Math.max(MIN_FONT, base * factor);
  let x = prev.x;
  let y = prev.y;
  if (handle === "nw" || handle === "sw") x = prev.x + prev.width - width;
  if (handle === "ne" || handle === "nw") y = prev.y + prev.height - height;
  const scaled = { ...next, x, y, width, height, fontSize };
  const pin = handle === "nw" || handle === "sw" ? "right" : "left";
  const reflowed = reflowTextLayer(scaled, measureFn, pin, unitScale, geometryInPixels);
  if (handle === "ne" || handle === "nw") {
    return { ...reflowed, y: scaled.y + scaled.height - reflowed.height };
  }
  return reflowed;
}
