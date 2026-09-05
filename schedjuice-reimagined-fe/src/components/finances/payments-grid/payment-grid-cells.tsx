import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

import { drawChip } from "@/components/import-grid/cells/draw-helpers";
import { getActiveFontFamily, getActiveFontPx } from "@/components/data-sheet/lib/glide-theme";
import { snakeToTitle } from "@/helpers/formatters";

export type PaymentStudentCellData = {
  kind: "payment-student-cell";
  name: string;
  overlapWarning: boolean;
  sharedNote: string | null;
};

export type PaymentStudentCell = CustomCell<PaymentStudentCellData>;

export const paymentStudentRenderer: CustomRenderer<PaymentStudentCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is PaymentStudentCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as PaymentStudentCellData)?.kind === "payment-student-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const px = getActiveFontPx();
    const padX = theme.cellHorizontalPadding;
    let y = rect.y + theme.cellVerticalPadding + px * 0.5;
    ctx.save();
    ctx.font = `${px}px ${getActiveFontFamily()}`;
    ctx.fillStyle = theme.textDark;
    ctx.textBaseline = "top";
    const maxW = rect.width - padX * 2;
    const name = cell.data.name || "—";
    ctx.fillText(
      name.length > 28 ? `${name.slice(0, 27)}…` : name,
      rect.x + padX,
      y,
      maxW,
    );
    if (cell.data.overlapWarning) {
      y += px + 4;
      drawChip(ctx, rect.x + padX, y, "Overlapping coverage", { attn: true });
    }
    if (cell.data.sharedNote) {
      y += px + 4;
      drawChip(ctx, rect.x + padX, y, cell.data.sharedNote, { attn: true });
    }
    ctx.restore();
  },
};

export type PaymentStatusCellData = {
  kind: "payment-status-cell";
  status: string;
  isDropped: boolean;
  isSyntheticUpload: boolean;
};

export type PaymentStatusCell = CustomCell<PaymentStatusCellData>;

export const paymentStatusRenderer: CustomRenderer<PaymentStatusCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is PaymentStatusCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as PaymentStatusCellData)?.kind === "payment-status-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const px = getActiveFontPx();
    const padX = theme.cellHorizontalPadding;
    ctx.save();
    ctx.font = `${px}px ${getActiveFontFamily()}`;
    ctx.fillStyle = theme.textDark;
    ctx.textBaseline = "middle";
    let label: string;
    if (cell.data.isDropped) {
      label = "Dropped";
      ctx.fillStyle = theme.textMedium;
    } else if (cell.data.isSyntheticUpload) {
      label = "Upload";
    } else {
      label = snakeToTitle(cell.data.status);
    }
    ctx.fillText(label, rect.x + padX, rect.y + rect.height / 2);
    ctx.restore();
  },
};

export type PaymentActionsCellData = {
  kind: "payment-actions-cell";
  labels: string[];
};

export type PaymentActionsCell = CustomCell<PaymentActionsCellData>;

export function measureActionSegments(labels: string[]): { start: number; width: number }[] {
  const ctx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  if (!ctx) return [];
  const px = getActiveFontPx();
  ctx.font = `${Math.max(9, Math.round(px * 0.85))}px ${getActiveFontFamily()}`;
  let x = 0;
  const gap = 8;
  return labels.map((label) => {
    const start = x;
    const width = ctx.measureText(label).width + 12;
    x += width + gap;
    return { start, width };
  });
}

export function findActionSegmentIndex(
  labels: string[],
  localEventX: number,
  cellHorizontalPadding: number,
): number {
  const rel = localEventX - cellHorizontalPadding;
  const layout = measureActionSegments(labels);
  return layout.findIndex(
    (seg) => rel >= seg.start && rel <= seg.start + seg.width,
  );
}

export const paymentActionsRenderer: CustomRenderer<PaymentActionsCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is PaymentActionsCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as PaymentActionsCellData)?.kind === "payment-actions-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const px = getActiveFontPx();
    const padX = theme.cellHorizontalPadding;
    let x = rect.x + padX;
    const cy = rect.y + rect.height / 2;
    ctx.save();
    ctx.font = `${Math.max(9, Math.round(px * 0.85))}px ${getActiveFontFamily()}`;
    ctx.textBaseline = "middle";
    for (const label of cell.data.labels) {
      const w = ctx.measureText(label).width + 12;
      const h = Math.max(18, Math.round(px * 1.3));
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(x + r, cy - h / 2);
      ctx.arcTo(x + w, cy - h / 2, x + w, cy + h / 2, r);
      ctx.arcTo(x + w, cy + h / 2, x, cy + h / 2, r);
      ctx.arcTo(x, cy + h / 2, x, cy - h / 2, r);
      ctx.arcTo(x, cy - h / 2, x + w, cy - h / 2, r);
      ctx.closePath();
      ctx.strokeStyle = theme.borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = theme.textDark;
      ctx.fillText(label, x + 6, cy + 0.5);
      x += w + 8;
    }
    ctx.restore();
  },
};

export const paymentGridCustomRenderers = [
  paymentStudentRenderer,
  paymentStatusRenderer,
  paymentActionsRenderer,
];
