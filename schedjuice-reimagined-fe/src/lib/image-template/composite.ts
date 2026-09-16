import { templatePixelSize } from "@/lib/id-card/template-geometry";
import { canvasFontFamily } from "./canvas-fonts";
import {
  canvasFontCss,
  clipLayerRect,
  drawImagePlaceholder,
  drawTextBlock,
  formatVariableLabel,
  isImageLayer,
  isVariableLayer,
  layerFontSizePx,
  photoClipRadiusPx,
} from "./layer-style";
import { SAMPLE_AWARD_BINDER, type AwardPreviewBinder } from "./preview-binder";
import { resolveLayerPreview } from "./resolve-layer-preview";
import type { AwardDocument, BackgroundFill, Layer, TemplateDocument } from "./types";

export function pagePixelSize(
  doc: TemplateDocument,
  _face: "front" | "back" = "front",
): { width: number; height: number } {
  if (doc.kind === "id_card") {
    return templatePixelSize(doc.width, doc.height, doc.dpi);
  }
  return { width: doc.width, height: doc.height };
}

export function backgroundDestRect(
  fill: BackgroundFill,
  image: { width: number; height: number },
  _page: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: fill.offsetX,
    y: fill.offsetY,
    width: image.width * fill.scale,
    height: image.height * fill.scale,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

async function paintLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  binder: AwardPreviewBinder,
  unitScale: number,
  tokens = false,
) {
  const x = layer.x * unitScale;
  const y = layer.y * unitScale;
  const width = layer.width * unitScale;
  const height = layer.height * unitScale;
  const rect = { x, y, width, height };
  ctx.save();
  clipLayerRect(ctx, rect, photoClipRadiusPx(layer, unitScale));
  if (tokens && isVariableLayer(layer)) {
    const fontSize = layerFontSizePx(layer, unitScale);
    drawTextBlock(
      ctx,
      layer,
      rect,
      formatVariableLabel(layer) ?? "",
      canvasFontCss(layer, unitScale),
      fontSize,
      { variable: true },
    );
    ctx.restore();
    return;
  }
  if (tokens && isImageLayer(layer)) {
    drawImagePlaceholder(ctx, rect);
    ctx.restore();
    return;
  }
  const preview = resolveLayerPreview(layer, binder);
  if (preview.kind === "image" && preview.url && !preview.placeholder) {
    try {
      const img = await loadImage(preview.url);
      const scale = Math.max(width / img.width, height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      ctx.drawImage(img, x + (width - drawW) / 2, y + (height - drawH) / 2, drawW, drawH);
    } catch {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(x, y, width, height);
    }
    ctx.restore();
    return;
  }
  const text = preview.kind === "text" ? preview.text : "";
  const fontSize = layerFontSizePx(layer, unitScale);
  drawTextBlock(
    ctx,
    layer,
    { x, y, width, height },
    text,
    canvasFontCss(layer, unitScale),
    fontSize,
  );
  ctx.restore();
}

export async function composite(
  doc: TemplateDocument,
  binder: AwardPreviewBinder,
  options?: { face?: "front" | "back"; tokens?: boolean },
): Promise<HTMLCanvasElement> {
  const face = options?.face ?? "front";
  const fill = doc.kind === "id_card" ? doc.background[face] : doc.background;
  const unitScale = doc.kind === "id_card" ? doc.dpi : 1;
  const layers = doc.kind === "id_card" ? doc.faces[face] : doc.layers;
  let page = pagePixelSize(doc, face);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  let backgroundImage: HTMLImageElement | null = null;
  if (fill.url) {
    try {
      backgroundImage = await loadImage(fill.url);
    } catch {
      backgroundImage = null;
    }
  }
  if ((page.width <= 0 || page.height <= 0) && backgroundImage) {
    page = { width: backgroundImage.width, height: backgroundImage.height };
  }
  canvas.width = Math.max(1, Math.round(page.width));
  canvas.height = Math.max(1, Math.round(page.height));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (backgroundImage) {
    const pixelFill = {
      ...fill,
      offsetX: fill.offsetX * unitScale,
      offsetY: fill.offsetY * unitScale,
      scale: fill.scale * unitScale,
    };
    const dest = backgroundDestRect(pixelFill, backgroundImage, page);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();
    ctx.drawImage(backgroundImage, dest.x, dest.y, dest.width, dest.height);
    ctx.restore();
  }

  const families = new Set(
    layers.map((layer) =>
      canvasFontFamily("fontFamily" in layer ? layer.fontFamily : undefined),
    ),
  );
  if (typeof document !== "undefined" && document.fonts?.load) {
    await Promise.all(
      Array.from(families).map((family) =>
        document.fonts.load(`16px "${family}"`).catch(() => undefined),
      ),
    );
  }

  const ordered = [...layers].sort((a, b) => a.z - b.z);
  for (const layer of ordered) {
    await paintLayer(ctx, layer, binder, unitScale, Boolean(options?.tokens));
  }
  return canvas;
}
