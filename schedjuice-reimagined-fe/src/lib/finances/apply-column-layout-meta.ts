// R12 may promote this helper into @/components/data-table/column-layout.
import type { Column } from "@/components/data-table";
import type {
  ColumnAlign,
  ColumnContentRole,
  ColumnSizing,
  ColumnWrapPolicy,
} from "@/components/data-table/types";

type ColumnLayoutContentRole = ColumnContentRole | "money";

export type ColumnLayoutMeta = {
  id: string;
  contentRole: ColumnLayoutContentRole;
  minWidth?: string;
  preferredWidth?: string;
  align?: ColumnAlign;
  truncate?: boolean;
  sticky?: "left";
};

function layoutRoleToSizingRole(
  contentRole: ColumnLayoutContentRole,
): ColumnContentRole {
  return contentRole === "money" ? "numeric" : contentRole;
}

function wrapFromMeta(meta: ColumnLayoutMeta): ColumnWrapPolicy | undefined {
  if (meta.truncate === true) return "truncate";
  if (meta.truncate === false) return "nowrap";
  return undefined;
}

export function layoutMetaToColumnSizing(meta: ColumnLayoutMeta): ColumnSizing {
  const role = layoutRoleToSizingRole(meta.contentRole);
  const sizing: ColumnSizing = { role };
  if (meta.align) sizing.align = meta.align;
  if (meta.minWidth || meta.preferredWidth) {
    sizing.width = {
      ...(meta.minWidth ? { min: meta.minWidth } : {}),
      ...(meta.preferredWidth ? { preferred: meta.preferredWidth } : {}),
    };
  }
  const wrap = wrapFromMeta(meta);
  if (wrap) sizing.wrap = wrap;
  if (meta.contentRole === "money") sizing.tabular = true;
  if (meta.sticky) sizing.sticky = meta.sticky;
  return sizing;
}

export function applyColumnLayoutMeta<T>(
  cols: Column<T>[],
  layout: ColumnLayoutMeta[],
): Column<T>[] {
  const byId = new Map(layout.map((m) => [m.id, m]));
  return cols.map((col) => {
    const meta = byId.get(col.id);
    if (!meta) return col;
    const sizing = layoutMetaToColumnSizing(meta);
    return {
      ...col,
      align: meta.align ?? col.align ?? sizing.align,
      sizing: {
        ...col.sizing,
        ...sizing,
        width: { ...col.sizing?.width, ...sizing.width },
      },
    };
  });
}
