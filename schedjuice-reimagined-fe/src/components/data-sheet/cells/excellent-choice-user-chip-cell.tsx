import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

import { drawChip } from "@/components/import-grid/cells/draw-helpers";

export type EcUserChipCellData = {
  kind: "ec-user-chip-cell";
  userId: number;
  name: string;
  email: string;
  label: string;
};

export type EcUserChipCell = CustomCell<EcUserChipCellData>;

export function authorizedPersonChipLabel(
  authorizedPerson: string,
  authorizedByName?: string | null,
): string {
  const explicit = (authorizedByName ?? "").trim();
  if (explicit) return explicit;
  const match = authorizedPerson.match(/^(.+?)\s*\(/);
  if (match?.[1]) return match[1].trim();
  return authorizedPerson.trim();
}

export const ecUserChipRenderer: CustomRenderer<EcUserChipCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is EcUserChipCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as EcUserChipCellData)?.kind === "ec-user-chip-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const x = rect.x + theme.cellHorizontalPadding;
    const cy = rect.y + rect.height / 2;
    const label = cell.data.label || "—";
    drawChip(ctx, x, cy - 10, label.length > 32 ? `${label.slice(0, 31)}…` : label, {});
  },
};
