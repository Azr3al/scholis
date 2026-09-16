import { canvasFontFamily } from "./canvas-fonts";
import {
  defaultVariableTemplate,
  layerCopy,
  splitTemplateRuns,
  variableTemplate,
} from "./variable-template";
import type { Layer, TextAlign } from "./types";

export const TEXT_LINE_HEIGHT_RATIO = 1.2;

export function textLineHeightPx(fontSizePx: number): number {
  return fontSizePx * TEXT_LINE_HEIGHT_RATIO;
}

/** Line height in layer geometry units: px when unitScale is 1, inches when unitScale is dpi. */
export function textLineHeightInLayerUnits(fontSize: number, unitScale = 1): number {
  const line = textLineHeightPx(fontSize);
  return unitScale === 1 ? line : line / 72;
}

/** Line height matching layer width/height units (document inches or artboard pixels). */
export function textLineHeightForLayer(
  fontSize: number,
  unitScale = 1,
  geometryInPixels = false,
): number {
  const docUnits = textLineHeightInLayerUnits(fontSize, unitScale);
  if (unitScale === 1 || !geometryInPixels) return docUnits;
  return docUnits * unitScale;
}

export function editOverlayHalfLeadingPx(fontSizePx: number): number {
  return (textLineHeightPx(fontSizePx) - fontSizePx) / 2;
}

export function isTextLike(
  layer: Layer,
): layer is Extract<Layer, { type: "text" | "field" | "named_person" }> {
  return layer.type === "text" || layer.type === "field" || layer.type === "named_person";
}

export function isVariableLayer(layer: Layer): boolean {
  return layer.type === "field" || layer.type === "named_person";
}

export function isImageLayer(layer: Layer): boolean {
  return layer.type === "photo" || layer.type === "signature" || layer.type === "qr";
}

export function drawImagePlaceholder(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const { x, y, width, height } = rect;
  ctx.fillStyle = "#ebe4d4";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(17, 17, 17, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

  const size = Math.min(width, height) * 0.42;
  if (size < 8) return;
  const left = x + (width - size) / 2;
  const top = y + (height - size * 0.75) / 2;
  const frameH = size * 0.75;
  ctx.strokeStyle = "rgba(17, 17, 17, 0.45)";
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.strokeRect(left, top, size, frameH);
  ctx.beginPath();
  ctx.arc(left + size * 0.28, top + frameH * 0.28, size * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(left + size * 0.08, top + frameH * 0.88);
  ctx.lineTo(left + size * 0.38, top + frameH * 0.42);
  ctx.lineTo(left + size * 0.55, top + frameH * 0.62);
  ctx.lineTo(left + size * 0.92, top + frameH * 0.88);
  ctx.stroke();
}

export function formatVariableLabel(layer: Layer): string | null {
  if (!defaultVariableTemplate(layer)) return null;
  return variableTemplate(layer);
}

export function variableChipPad(fontSizePx: number): { x: number; y: number } {
  return {
    x: Math.max(4, fontSizePx * 0.22),
    y: Math.max(2, fontSizePx * 0.08),
  };
}

export function estimateGlyphWidth(text: string, fontSizePx: number): number {
  return text.length * fontSizePx * 0.5;
}

export function measureAdvance(
  text: string,
  measure: (value: string) => number,
): number {
  if (!text) return 0;
  if (!/\s$/.test(text)) return measure(text);
  return measure(`${text}.`) - measure(".");
}

export function measureTemplateLineWidth(
  line: string,
  measure: (value: string) => number,
  fontSizePx: number,
): number {
  const pad = variableChipPad(fontSizePx);
  return splitTemplateRuns(line).reduce((sum, run) => {
    if (run.kind === "token") return sum + measureAdvance(run.raw, measure) + pad.x * 2;
    return sum + measureAdvance(run.text, measure);
  }, 0);
}

export type ReflowPin = "left" | "right" | "align";

function widestAtomWidth(
  text: string,
  measure: (value: string) => number,
  fontSizePx: number,
): number {
  let max = 0;
  for (const paragraph of text.split("\n")) {
    for (const atom of layoutAtoms(paragraph)) {
      if (!atom.trim()) continue;
      max = Math.max(max, measureTemplateLineWidth(atom, measure, fontSizePx));
    }
  }
  return max;
}

export function reflowTextLayer<T extends Layer>(
  layer: T,
  measure?: (value: string) => number,
  pin: ReflowPin = "align",
  unitScale = 1,
  geometryInPixels = false,
): T {
  if (!isTextLike(layer)) return layer;
  const copy = layerCopy(layer);
  const fontSize =
    typeof layer.fontSize === "number" && layer.fontSize > 0
      ? layer.fontSize
      : defaultFontSizePx(layer.height);
  const measureFn = measure ?? ((value: string) => estimateGlyphWidth(value, fontSize));
  const width = Math.max(layer.width, widestAtomWidth(copy, measureFn, fontSize));
  const lines = layoutTextLines(copy, width, measureFn, fontSize);
  const lineHeight = textLineHeightForLayer(fontSize, unitScale, geometryInPixels);
  const height = Math.max(lineHeight, lines.length * lineHeight);
  const extra = width - layer.width;
  let x = layer.x;
  if (pin === "right") x = layer.x + layer.width - width;
  else if (pin === "align") {
    if (layer.align === "center") x -= extra / 2;
    if (layer.align === "right") x -= extra;
  }
  const next = { ...layer, x, width, height, fontSize };
  if (next.type === "field" || next.type === "named_person") {
    return { ...next, template: copy };
  }
  return next;
}

export function fitCopyLayer<T extends Layer>(
  layer: T,
  measure?: (value: string) => number,
  unitScale = 1,
  geometryInPixels = false,
): T {
  return reflowTextLayer(layer, measure, "align", unitScale, geometryInPixels);
}

export function fitVariableLayer<T extends Layer>(layer: T): T {
  return fitCopyLayer(layer);
}

export const VARIABLE_INK = "#6b4ee6";
const VARIABLE_CHIP = "rgba(107, 78, 230, 0.16)";
const VARIABLE_CHIP_STROKE = "rgba(107, 78, 230, 0.5)";

export function defaultFontSizePx(height: number): number {
  return Math.max(8, height * 0.6);
}

export function defaultFontSizePt(heightIn: number): number {
  return Math.max(8, heightIn * 72 * 0.6);
}

export function textStyleFlags(layer: Layer): {
  bold: boolean;
  italic: boolean;
  underline: boolean;
} {
  if (!isTextLike(layer)) return { bold: false, italic: false, underline: false };
  return {
    bold: Boolean(layer.bold || layer.fontStyle === "bold"),
    italic: Boolean(layer.italic || layer.fontStyle === "italic"),
    underline: Boolean(layer.underline),
  };
}

export function derivedFontStyle(
  flags: { bold: boolean; italic: boolean },
): "bold" | "italic" | "normal" | undefined {
  if (flags.bold) return "bold";
  if (flags.italic) return "italic";
  return undefined;
}

export function layerFontSizePx(layer: Layer, unitScale: number, zoom = 1): number {
  const height = layer.height * (unitScale === 1 ? 1 : unitScale);
  const size =
    isTextLike(layer) && layer.fontSize
      ? layer.fontSize * (unitScale === 1 ? 1 : unitScale / 72)
      : Math.max(12, height * 0.6);
  return size * zoom;
}

export function canvasFontCss(layer: Layer, unitScale: number, zoom = 1): string {
  const flags = textStyleFlags(layer);
  const family = canvasFontFamily(isTextLike(layer) ? layer.fontFamily : undefined);
  return `${flags.italic ? "italic " : ""}${flags.bold ? "bold " : ""}${layerFontSizePx(layer, unitScale, zoom)}px "${family}", sans-serif`;
}

export function photoClipRadiusPx(layer: Layer, unitScale: number): number {
  if (layer.type !== "photo" || layer.borderRadiusPt == null) return 0;
  const scale = unitScale === 1 ? 1 : unitScale / 72;
  return Math.max(0, layer.borderRadiusPt * scale);
}

export function layerTextColor(layer: Layer): string {
  return isTextLike(layer) && layer.color ? layer.color : "#111111";
}

export function layerTextAlign(layer: Layer): TextAlign {
  return isTextLike(layer) && layer.align ? layer.align : "left";
}

export function normalizeLayer(raw: Layer): Layer {
  if (raw.type === "photo") {
    return {
      ...raw,
      removeBackground: raw.removeBackground ?? raw.photoKind === "award_image",
    };
  }
  if (!isTextLike(raw)) return raw;
  const flags = textStyleFlags(raw);
  return {
    ...raw,
    bold: flags.bold || undefined,
    italic: flags.italic || undefined,
    underline: flags.underline || undefined,
  };
}

export function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  rect: { x: number; y: number; width: number; height: number },
  text: string,
  fontCss: string,
  fontSizePx: number,
  _options?: { variable?: boolean },
) {
  const flags = textStyleFlags(layer);
  const color = layerTextColor(layer);
  const align = layerTextAlign(layer);
  const measure = (value: string) => ctx.measureText(value).width;
  ctx.font = fontCss;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const lines = layoutTextLines(text, rect.width, measure, fontSizePx);
  const lineHeight = textLineHeightPx(fontSizePx);
  const { x: padX, y: padY } = variableChipPad(fontSizePx);
  lines.forEach((line, index) => {
    const y = rect.y + index * lineHeight;
    const lineWidth = measureTemplateLineWidth(line, measure, fontSizePx);
    let x = rect.x;
    if (align === "center") x = rect.x + (rect.width - lineWidth) / 2;
    if (align === "right") x = rect.x + rect.width - lineWidth;
    for (const run of splitTemplateRuns(line)) {
      const raw = run.kind === "token" ? run.raw : run.text;
      const runWidth = measureAdvance(raw, measure);
      if (run.kind === "token" && raw) {
        const chip = {
          x: x,
          y: y - padY,
          w: runWidth + padX * 2,
          h: fontSizePx + padY * 2,
          r: Math.min(10, fontSizePx * 0.35),
        };
        ctx.beginPath();
        ctx.roundRect(chip.x, chip.y, chip.w, chip.h, chip.r);
        ctx.fillStyle = VARIABLE_CHIP;
        ctx.fill();
        ctx.strokeStyle = VARIABLE_CHIP_STROKE;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = VARIABLE_INK;
        ctx.font = fontCss.includes("italic") ? fontCss : `italic ${fontCss}`;
        ctx.fillText(raw, x + padX, y);
        ctx.font = fontCss;
        x += chip.w;
      } else {
        ctx.fillStyle = color;
        ctx.fillText(raw, x, y);
        x += runWidth;
      }
    }
    if (!flags.underline || !line) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, fontSizePx * 0.06);
    const underlineX =
      align === "center"
        ? rect.x + (rect.width - lineWidth) / 2
        : align === "right"
          ? rect.x + rect.width - lineWidth
          : rect.x;
    ctx.moveTo(underlineX, y + fontSizePx);
    ctx.lineTo(underlineX + lineWidth, y + fontSizePx);
    ctx.stroke();
  });
}

function layoutAtoms(paragraph: string): string[] {
  const atoms: string[] = [];
  const re = /\{\{[^}]+\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(paragraph))) {
    const before = paragraph.slice(last, match.index);
    if (before) atoms.push(...before.split(/(\s+)/).filter((part) => part.length > 0));
    atoms.push(match[0]);
    last = match.index + match[0].length;
  }
  const rest = paragraph.slice(last);
  if (rest) atoms.push(...rest.split(/(\s+)/).filter((part) => part.length > 0));
  return atoms;
}

export function layoutTextLines(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
  fontSizePx: number,
): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const atoms = layoutAtoms(paragraph);
    let current = atoms[0] ?? "";
    for (let i = 1; i < atoms.length; i += 1) {
      const next = `${current}${atoms[i]}`;
      if (measureTemplateLineWidth(next, measure, fontSizePx) <= maxWidth) current = next;
      else {
        lines.push(current);
        current = (atoms[i] ?? "").replace(/^\s+/, "");
      }
    }
    lines.push(current);
  }
  return lines;
}

let measureCanvas: HTMLCanvasElement | null = null;

export function measureTextWidthPx(text: string, fontCss: string): number {
  if (typeof document === "undefined") return 0;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = fontCss;
  return measureAdvance(text, (value) => ctx.measureText(value).width);
}

export function measureTextInLayerUnits(
  layer: Layer,
  unitScale: number,
  text: string,
  geometryInPixels = false,
): number {
  const px = measureTextWidthPx(text, canvasFontCss(layer, unitScale, 1));
  if (unitScale === 1) return px;
  return geometryInPixels ? px : px / unitScale;
}

export function measureLayerTextWidth(layer: Layer, unitScale: number, text: string): number {
  return measureTextInLayerUnits(layer, unitScale, text, false);
}

export function clipLayerRect(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
) {
  ctx.beginPath();
  if (radius > 0 && "roundRect" in ctx) {
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  } else {
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.clip();
}
