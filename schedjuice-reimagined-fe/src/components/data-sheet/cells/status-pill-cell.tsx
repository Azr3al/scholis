import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

export type StatusPillCellData = {
  kind: "status-pill-cell";
  name: string;
  color: string;
};

export type StatusPillCell = CustomCell<StatusPillCellData>;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export const statusPillRenderer: CustomRenderer<StatusPillCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is StatusPillCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as StatusPillCellData)?.kind === "status-pill-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { name, color } = cell.data;
    if (!name) return;

    ctx.save();
    ctx.font = theme.baseFontFull;
    const textWidth = ctx.measureText(name).width;
    const pillPadX = 8;
    const pillHeight = 20;
    const x = rect.x + theme.cellHorizontalPadding;
    const y = rect.y + (rect.height - pillHeight) / 2;
    const w = textWidth + pillPadX * 2;

    ctx.fillStyle = hexToRgba(color, 0.15);
    roundRect(ctx, x, y, w, pillHeight, pillHeight / 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(name, x + pillPadX, rect.y + rect.height / 2);
    ctx.restore();
  },
};
