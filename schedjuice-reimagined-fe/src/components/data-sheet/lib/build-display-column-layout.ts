import type { GridColumn } from "@glideapps/glide-data-grid";

import { formatColumnTitle } from "./sort-rows";
import type { SortState } from "../types";

export type DisplayColumnLayout = {
  colSourceIndex: number[];
  displayColumns: GridColumn[];
  displayFields: (string | null)[];
};

type BuildDisplayColumnLayoutArgs = {
  columns: GridColumn[];
  fieldByColumn: (string | null)[];
  layoutOrder: string[];
  hiddenFields: string[];
  titleByField: Map<string, string>;
  defaultWidths: Record<string, number>;
  layoutWidths: Record<string, number>;
  sort: SortState | null;
  sortable: boolean;
};

/** Merge persisted column order with fixed spacer columns (null fieldByColumn entries). */
export function buildDisplayColumnLayout(
  args: BuildDisplayColumnLayoutArgs,
): DisplayColumnLayout {
  const hidden = new Set(args.hiddenFields);
  const layoutOrder = args.layoutOrder.filter((field) => !hidden.has(field));

  const colSourceIndex: number[] = [];
  const displayColumns: GridColumn[] = [];
  const displayFields: (string | null)[] = [];
  let segmentSourceIndices: number[] = [];

  const flushSegment = () => {
    if (segmentSourceIndices.length === 0) return;
    const segmentSet = new Set(segmentSourceIndices);
    for (const field of layoutOrder) {
      const sourceIdx = args.fieldByColumn.indexOf(field);
      if (sourceIdx < 0 || !segmentSet.has(sourceIdx)) continue;
      appendDisplayColumn(sourceIdx, field);
    }
    segmentSourceIndices = [];
  };

  const appendDisplayColumn = (sourceIdx: number, field: string | null) => {
    const col = args.columns[sourceIdx];
    if (!col) return;
    colSourceIndex.push(sourceIdx);
    displayFields.push(field);
    if (field == null) {
      displayColumns.push(col);
      return;
    }
    displayColumns.push({
      id: col.id ?? field,
      title: formatColumnTitle(
        args.titleByField.get(field) ?? field,
        field,
        args.sortable ? args.sort : null,
      ),
      width:
        args.layoutWidths[field] ??
        args.defaultWidths[field] ??
        ("width" in col && col.width != null ? col.width : 160),
    });
  };

  for (let sourceIdx = 0; sourceIdx < args.fieldByColumn.length; sourceIdx++) {
    const field = args.fieldByColumn[sourceIdx];
    if (field == null) {
      flushSegment();
      appendDisplayColumn(sourceIdx, null);
      continue;
    }
    segmentSourceIndices.push(sourceIdx);
  }
  flushSegment();

  return { colSourceIndex, displayColumns, displayFields };
}
