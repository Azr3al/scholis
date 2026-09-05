import {
  GridCellKind,
  roundedRect,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

export type IdPhotoCellData = {
  kind: "id-photo-cell";
  userId: number;
  url: string | null;
  initials: string;
};

export type IdPhotoCell = CustomCell<IdPhotoCellData>;

export function initialsFromName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  size: number,
) {
  const imgRatio = img.width / img.height;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > 1) {
    sw = img.height;
    sx = (img.width - sw) / 2;
  } else if (imgRatio < 1) {
    sh = img.width;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size);
}

export const idPhotoRenderer: CustomRenderer<IdPhotoCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is IdPhotoCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as IdPhotoCellData)?.kind === "id-photo-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme, col, row, imageLoader } = args;
    const padX = theme.cellHorizontalPadding;
    const padY = theme.cellVerticalPadding;
    const size = Math.min(
      rect.height - padY * 2,
      rect.width - padX * 2,
      34,
    );
    const x = rect.x + padX;
    const y = rect.y + (rect.height - size) / 2;
    const radius = 6;

    if (cell.data.url) {
      const img = imageLoader.loadOrGetImage(cell.data.url, col, row);
      if (img !== undefined) {
        ctx.save();
        roundedRect(ctx, x, y, size, size, radius);
        ctx.clip();
        drawCoverImage(ctx, img as HTMLImageElement, x, y, size);
        ctx.restore();
        return;
      }
    }

    ctx.save();
    roundedRect(ctx, x, y, size, size, radius);
    ctx.fillStyle = theme.bgCellMedium ?? "#e4e4e7";
    ctx.fill();
    ctx.fillStyle = theme.textMedium ?? "#71717a";
    ctx.font = `600 ${Math.max(10, Math.round(size * 0.36))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.data.initials, x + size / 2, y + size / 2 + 0.5);
    ctx.restore();
  },
};
