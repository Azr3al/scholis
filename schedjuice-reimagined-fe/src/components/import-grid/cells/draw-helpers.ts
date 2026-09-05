import {
  getActiveFontFamily,
  getActiveFontPx,
  getActiveLinkColors,
} from "@/components/import-grid/glide-theme";

function cellFont(px: number): string {
  return `${px}px ${getActiveFontFamily()}`;
}

function chipFont(px: number): string {
  return `${Math.max(9, Math.round(px * 0.9))}px ${getActiveFontFamily()}`;
}

function tagFont(px: number): string {
  return `${Math.max(8, Math.round(px * 0.72))}px ${getActiveFontFamily()}`;
}

/** Chip body width plus trailing gap (matches `drawChip` return value). */
export function chipAdvanceWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { check?: boolean } = {},
): number {
  const px = getActiveFontPx();
  ctx.save();
  ctx.font = chipFont(px);
  const padX = Math.max(6, Math.round(px * 0.55));
  const chipPx = Math.max(9, Math.round(px * 0.9));
  const checkW = opts.check ? Math.round(chipPx * 1.1) : 0;
  const textW = ctx.measureText(text).width;
  const w = padX * 2 + textW + checkW;
  ctx.restore();
  return w + 6;
}

export function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opts: { attn?: boolean; warn?: boolean; check?: boolean; ghost?: boolean } = {},
): number {
  const colors = getActiveLinkColors();
  const px = getActiveFontPx();
  const chipPx = Math.max(9, Math.round(px * 0.9));
  ctx.save();
  ctx.font = chipFont(px);
  const padX = Math.max(6, Math.round(px * 0.55));
  const checkW = opts.check ? Math.round(chipPx * 1.1) : 0;
  const textW = ctx.measureText(text).width;
  const w = padX * 2 + textW + checkW;
  const h = Math.max(16, Math.round(px * 1.45));
  const r = Math.min(h / 2, 12);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  const bg = opts.warn ? colors.warnBg : opts.attn ? colors.attnBg : colors.chipBg;
  const border = opts.ghost
    ? colors.ghostBorder
    : opts.warn
      ? colors.warnBorder
      : opts.attn
        ? colors.attnBorder
        : colors.chipBorder;
  const textColor = opts.ghost
    ? colors.ghostText
    : opts.warn
      ? colors.warnText
      : opts.attn
        ? colors.attnText
        : colors.chipText;
  if (!opts.ghost) {
    ctx.fillStyle = bg;
    ctx.fill();
  }
  ctx.lineWidth = 1;
  if (opts.ghost) {
    ctx.setLineDash([3, 2]);
  }
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 0.5);
  if (opts.check) {
    ctx.fillStyle = colors.check;
    ctx.fillText("✓", x + padX + textW + 4, y + h / 2 + 0.5);
  }
  ctx.restore();
  return w + 6;
}

export function drawShimmerText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  time: number,
): void {
  const colors = getActiveLinkColors();
  const px = getActiveFontPx();
  ctx.save();
  ctx.font = cellFont(px);
  ctx.textBaseline = "middle";
  const width = Math.max(px * 4, ctx.measureText(text).width);
  const phase = (time / 2000) % 1;
  const center = x - width + phase * (width * 2);
  const grad = ctx.createLinearGradient(center - 40, 0, center + 40, 0);
  grad.addColorStop(0, colors.shimmerBase);
  grad.addColorStop(0.5, colors.shimmerHighlight);
  grad.addColorStop(1, colors.shimmerBase);
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawNewTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const colors = getActiveLinkColors();
  ctx.save();
  ctx.font = tagFont(getActiveFontPx());
  ctx.fillStyle = colors.newTag;
  ctx.textBaseline = "middle";
  ctx.fillText("new user", x, y);
  ctx.restore();
}

export function drawUnmatchedTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const colors = getActiveLinkColors();
  ctx.save();
  ctx.font = tagFont(getActiveFontPx());
  ctx.fillStyle = colors.ghostText;
  ctx.textBaseline = "middle";
  ctx.fillText("unmatched", x, y);
  ctx.restore();
}

export function drawIgnoredTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const colors = getActiveLinkColors();
  ctx.save();
  ctx.font = tagFont(getActiveFontPx());
  ctx.fillStyle = colors.ghostText;
  ctx.textBaseline = "middle";
  ctx.fillText("ignored", x, y);
  ctx.restore();
}

export function drawDupTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const colors = getActiveLinkColors();
  ctx.save();
  ctx.font = tagFont(getActiveFontPx());
  ctx.fillStyle = colors.attnText;
  ctx.textBaseline = "middle";
  ctx.fillText("dup", x, y);
  ctx.restore();
}

export function drawKeptTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const colors = getActiveLinkColors();
  ctx.save();
  ctx.font = tagFont(getActiveFontPx());
  ctx.fillStyle = colors.chipText;
  ctx.textBaseline = "middle";
  ctx.fillText("kept", x, y);
  ctx.restore();
}

export function drawSkipTag(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const colors = getActiveLinkColors();
  ctx.save();
  ctx.font = tagFont(getActiveFontPx());
  ctx.fillStyle = colors.shimmerBase;
  ctx.textBaseline = "middle";
  ctx.fillText("skip", x, y);
  ctx.restore();
}
