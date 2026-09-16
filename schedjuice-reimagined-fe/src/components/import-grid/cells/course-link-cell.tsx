import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

import { drawChip, drawShimmerText } from "./draw-helpers";
import type { CourseLinkCellData } from "./types";

export type CourseLinkCell = CustomCell<CourseLinkCellData>;

export const courseLinkRenderer: CustomRenderer<CourseLinkCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is CourseLinkCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as CourseLinkCellData)?.kind === "course-link-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme, frameTime } = args;
    const d = cell.data;
    let x = rect.x + theme.cellHorizontalPadding;
    const cy = rect.y + rect.height / 2;
    if (d.status === "resolving" && d.tokens.length === 0) {
      drawShimmerText(ctx, x, cy, d.raw, frameTime);
      return;
    }
    for (const t of d.tokens) {
      if (t.status === "resolving") {
        drawShimmerText(ctx, x, cy, t.raw, frameTime);
        x += ctx.measureText(t.raw).width + 12;
      } else if (t.status === "linked") {
        const title = t.match?.title ?? t.raw;
        x += drawChip(ctx, x, cy - 10, t.conflict ? `${title} ⚠` : title, {
          check: true,
        });
      } else {
        const hint = t.candidates?.[0]?.title;
        const label = hint ? `${t.raw} → ${hint}?` : t.raw;
        x += drawChip(ctx, x, cy - 10, `${label} choose`, { attn: true });
      }
    }
  },
};
