"use client";

import { useCallback, useEffect, useState } from "react";

export type ColumnLayout = {
  order: string[];
  widths: Record<string, number>;
  hidden: string[];
};

export function defaultColumnWidth(field: string): number {
  if (field === "email") return 240;
  if (field === "courses") return 280;
  return 160;
}

function readLayout(key: string): ColumnLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ColumnLayout;
  } catch {
    return null;
  }
}

function writeLayout(key: string, layout: ColumnLayout): void {
  localStorage.setItem(key, JSON.stringify(layout));
}

export function mergeColumnLayout(
  fieldIds: readonly string[],
  stored: ColumnLayout | null,
): ColumnLayout {
  const order = stored?.order?.filter((f) => fieldIds.includes(f)) ?? [];
  for (const field of fieldIds) {
    if (!order.includes(field)) order.push(field);
  }
  const widths: Record<string, number> = {};
  for (const field of fieldIds) {
    widths[field] = stored?.widths?.[field] ?? defaultColumnWidth(field);
  }
  const hidden = (stored?.hidden ?? []).filter((f) => fieldIds.includes(f));
  return { order, widths, hidden };
}

export function useColumnLayout(fieldIds: readonly string[]) {
  const fieldsKey = [...fieldIds].sort().join("|");
  const key = `import-grid:layout:${fieldsKey}`;
  const stableFieldIds = fieldsKey ? fieldsKey.split("|") : [];

  const [layout, setLayout] = useState<ColumnLayout>(() =>
    mergeColumnLayout(stableFieldIds, null),
  );

  useEffect(() => {
    const ids = fieldsKey ? fieldsKey.split("|") : [];
    setLayout(mergeColumnLayout(ids, readLayout(key)));
  }, [key, fieldsKey]);

  const persist = useCallback(
    (next: ColumnLayout) => {
      setLayout(next);
      writeLayout(key, next);
    },
    [key],
  );

  const moveColumn = useCallback(
    (from: number, to: number) => {
      const nextOrder = [...layout.order];
      const [removed] = nextOrder.splice(from, 1);
      nextOrder.splice(to, 0, removed);
      persist({ ...layout, order: nextOrder });
    },
    [layout, persist],
  );

  const resizeColumn = useCallback(
    (field: string, width: number) => {
      persist({
        ...layout,
        widths: { ...layout.widths, [field]: width },
      });
    },
    [layout, persist],
  );

  const setHidden = useCallback(
    (field: string, hidden: boolean) => {
      const set = new Set(layout.hidden);
      if (hidden) set.add(field);
      else set.delete(field);
      persist({ ...layout, hidden: Array.from(set) });
    },
    [layout, persist],
  );

  const setColumnWidths = useCallback(
    (widths: Record<string, number>) => {
      persist({ ...layout, widths: { ...layout.widths, ...widths } });
    },
    [layout, persist],
  );

  const resetLayout = useCallback(() => {
    const ids = fieldsKey ? fieldsKey.split("|") : [];
    persist(mergeColumnLayout(ids, null));
  }, [fieldsKey, persist]);

  return {
    layout,
    moveColumn,
    resizeColumn,
    setHidden,
    setColumnWidths,
    resetLayout,
  };
}
