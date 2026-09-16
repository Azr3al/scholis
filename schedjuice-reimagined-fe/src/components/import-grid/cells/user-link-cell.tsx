import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

import { getActiveLinkColors } from "@/components/import-grid/glide-theme";

import {
  drawChip,
  drawIgnoredTag,
  drawKeptTag,
  drawNewTag,
  drawShimmerText,
  drawSkipTag,
  drawUnmatchedTag,
} from "./draw-helpers";
import type { UserLinkCellData } from "./types";

export type UserLinkCell = CustomCell<UserLinkCellData>;

function drawDuplicateRoleTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  role: "kept" | "skipped",
): void {
  if (role === "kept") drawKeptTag(ctx, x, y);
  else drawSkipTag(ctx, x, y);
}

export const userLinkRenderer: CustomRenderer<UserLinkCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is UserLinkCell =>
    c.kind === GridCellKind.Custom && (c.data as UserLinkCellData)?.kind === "user-link-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme, frameTime } = args;
    const d = cell.data;
    const x = rect.x + theme.cellHorizontalPadding;
    const cy = rect.y + rect.height / 2;
    if (d.status === "resolving") {
      drawShimmerText(ctx, x, cy, d.raw, frameTime);
      return;
    }
    if (d.status === "confirmed") {
      const chipW = drawChip(ctx, x, cy - 10, d.label ?? d.raw, { check: true });
      if (d.duplicateRole) {
        drawDuplicateRoleTag(ctx, x + chipW + 4, cy, d.duplicateRole);
      }
      return;
    }
    if (d.status === "pending_match") {
      const chipW = drawChip(ctx, x, cy - 10, `${d.label ?? d.raw} confirm?`, {
        attn: !d.nameMismatch,
        warn: Boolean(d.nameMismatch),
      });
      if (d.duplicateRole) {
        drawDuplicateRoleTag(ctx, x + chipW + 4, cy, d.duplicateRole);
      }
      return;
    }
    if (d.status === "pending_candidates") {
      const n = d.candidateCount ?? 0;
      const chipW = drawChip(ctx, x, cy - 10, `${n} possible choose`, {
        attn: true,
      });
      if (d.duplicateRole) {
        drawDuplicateRoleTag(ctx, x + chipW + 4, cy, d.duplicateRole);
      }
      return;
    }
    if (d.status === "new") {
      if (d.variant === "roster") {
        const chipW = drawChip(ctx, x, cy - 10, d.raw, { ghost: true });
        let tagX = x + chipW + 8;
        drawUnmatchedTag(ctx, tagX, cy);
        tagX += 56;
        if (d.duplicateRole) {
          drawDuplicateRoleTag(ctx, tagX, cy, d.duplicateRole);
        }
        return;
      }
      const chipW = drawChip(ctx, x, cy - 10, d.raw, {});
      let tagX = x + chipW + 8;
      drawNewTag(ctx, tagX, cy);
      tagX += 36;
      if (d.duplicateRole) {
        drawDuplicateRoleTag(ctx, tagX, cy, d.duplicateRole);
      }
      return;
    }
    if (d.status === "ignored") {
      const chipW = drawChip(ctx, x, cy - 10, d.raw, { ghost: true });
      let tagX = x + chipW + 8;
      drawIgnoredTag(ctx, tagX, cy);
      if (d.duplicateRole) {
        drawDuplicateRoleTag(ctx, tagX + 48, cy, d.duplicateRole);
      }
      return;
    }
    if (d.status === "error") {
      ctx.save();
      ctx.fillStyle = getActiveLinkColors().error;
      ctx.textBaseline = "middle";
      ctx.font = `${theme.baseFontStyle} ${theme.fontFamily}`;
      ctx.fillText(d.raw || "(invalid email)", x, cy);
      ctx.restore();
      if (d.duplicateRole) {
        const adv = ctx.measureText(d.raw || "(invalid email)").width;
        drawDuplicateRoleTag(ctx, x + adv + 8, cy, d.duplicateRole);
      }
      return;
    }
    if (d.raw) {
      if (d.variant === "roster") {
        const chipW = drawChip(ctx, x, cy - 10, d.raw, { ghost: true });
        drawUnmatchedTag(ctx, x + chipW + 8, cy);
        return;
      }
      drawChip(ctx, x, cy - 10, d.raw, {});
    }
  },
};
