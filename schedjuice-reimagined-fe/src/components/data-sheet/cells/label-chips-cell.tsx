import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

import { getActiveFontPx } from "@/components/import-grid/glide-theme";
import { drawChip } from "@/components/import-grid/cells/draw-helpers";

export type LabelChipsLayout = "inline" | "stack";

export type LabelChipsCellData = {
  kind: "label-chips-cell";
  labels: string[];
  layout: LabelChipsLayout;
};

export type LabelChipsCell = CustomCell<LabelChipsCellData>;

function chipHeight(): number {
  const px = getActiveFontPx();
  return Math.max(16, Math.round(px * 1.45));
}

function stackGap(): number {
  return 8;
}

export const labelChipsRenderer: CustomRenderer<LabelChipsCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is LabelChipsCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as LabelChipsCellData)?.kind === "label-chips-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { labels, layout } = cell.data;
    if (labels.length === 0) return;

    const x = rect.x + theme.cellHorizontalPadding;
    const h = chipHeight();
    const gap = stackGap();

    if (layout === "stack") {
      const totalH = labels.length * h + (labels.length - 1) * gap;
      let y = rect.y + (rect.height - totalH) / 2;
      for (const label of labels) {
        drawChip(ctx, x, y, label, {});
        y += h + gap;
      }
      return;
    }

    const cy = rect.y + rect.height / 2;
    let chipX = x;
    for (const label of labels) {
      chipX += drawChip(ctx, chipX, cy - h / 2, label, {});
    }
  },
};
