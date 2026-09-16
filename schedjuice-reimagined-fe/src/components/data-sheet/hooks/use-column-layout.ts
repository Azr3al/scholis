"use client";

import { useCallback, useEffect, useState } from "react";

import type { SortState } from "../types";

export type ColumnLayout = {
  order: string[];
  widths: Record<string, number>;
  hidden: string[];
  sort: SortState | null;
};

function readLayout(key: string): ColumnLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ColumnLayout>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      widths:
        parsed.widths && typeof parsed.widths === "object" ? parsed.widths : {},
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      sort:
        parsed.sort &&
        typeof parsed.sort.field === "string" &&
        (parsed.sort.direction === "asc" || parsed.sort.direction === "desc")
          ? parsed.sort
          : null,
    };
  } catch {
    return null;
  }
}

function writeLayout(key: string, layout: ColumnLayout): void {
  localStorage.setItem(key, JSON.stringify(layout));
}

export function mergeColumnLayout(
  fieldIds: readonly string[],
  defaultWidths: Record<string, number>,
  stored: ColumnLayout | null,
): ColumnLayout {
  const storedOrder = stored?.order?.filter((f) => fieldIds.includes(f)) ?? [];
  let order: string[];

  if (storedOrder.length === 0) {
    order = [...fieldIds];
  } else {
    order = [...storedOrder];
    for (const field of fieldIds) {
      if (order.includes(field)) continue;
      const canonicalIdx = fieldIds.indexOf(field);
      let insertAt = 0;
      for (let i = 0; i < order.length; i++) {
        if (fieldIds.indexOf(order[i]!) < canonicalIdx) insertAt = i + 1;
      }
      order.splice(insertAt, 0, field);
    }
  }

  const widths: Record<string, number> = {};
  for (const field of fieldIds) {
    widths[field] = stored?.widths?.[field] ?? defaultWidths[field] ?? 160;
  }
  const hidden = (stored?.hidden ?? []).filter((f) => fieldIds.includes(f));
  const sort =
    stored?.sort && fieldIds.includes(stored.sort.field) ? stored.sort : null;
  return { order, widths, hidden, sort };
}

export function useColumnLayout(
  persistKey: string,
  fieldIds: readonly string[],
  defaultWidths: Record<string, number>,
) {
  const key = `data-sheet:layout:${persistKey}`;

  const [layout, setLayout] = useState<ColumnLayout>(() =>
    mergeColumnLayout(fieldIds, defaultWidths, null),
  );

  useEffect(() => {
    setLayout(mergeColumnLayout(fieldIds, defaultWidths, readLayout(key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile when field set or defaults change
  }, [key, fieldIds.join("|")]);

  const persist = useCallback(
    (next: ColumnLayout) => {
      setLayout(next);
      writeLayout(key, next);
    },
    [key],
  );

  const visibleOrder = useCallback(
    () => layout.order.filter((f) => !layout.hidden.includes(f)),
    [layout.order, layout.hidden],
  );

  const moveColumn = useCallback(
    (fromDisplay: number, toDisplay: number, freezeCount = 0) => {
      const visible = visibleOrder();
      if (
        fromDisplay < freezeCount ||
        toDisplay < freezeCount ||
        fromDisplay >= visible.length ||
        toDisplay >= visible.length
      ) {
        return;
      }
      const nextVisible = [...visible];
      const [removed] = nextVisible.splice(fromDisplay, 1);
      nextVisible.splice(toDisplay, 0, removed);
      const hiddenFields = layout.order.filter((f) => layout.hidden.includes(f));
      persist({ ...layout, order: [...nextVisible, ...hiddenFields] });
    },
    [layout, persist, visibleOrder],
  );

  const setWidth = useCallback(
    (field: string, width: number) => {
      persist({
        ...layout,
        widths: { ...layout.widths, [field]: width },
      });
    },
    [layout, persist],
  );

  const toggleHidden = useCallback(
    (field: string) => {
      const hiddenSet = new Set(layout.hidden);
      const isHidden = hiddenSet.has(field);
      const visibleCount = layout.order.filter((f) => !hiddenSet.has(f)).length;
      if (!isHidden && visibleCount <= 1) return;
      if (isHidden) hiddenSet.delete(field);
      else hiddenSet.add(field);
      persist({ ...layout, hidden: Array.from(hiddenSet) });
    },
    [layout, persist],
  );

  const cycleSort = useCallback(
    (field: string) => {
      const current = layout.sort;
      if (!current || current.field !== field) {
        persist({ ...layout, sort: { field, direction: "asc" } });
        return;
      }
      if (current.direction === "asc") {
        persist({ ...layout, sort: { field, direction: "desc" } });
        return;
      }
      persist({ ...layout, sort: null });
    },
    [layout, persist],
  );

  const setSort = useCallback(
    (field: string, direction: "asc" | "desc" | null) => {
      if (direction == null) {
        persist({ ...layout, sort: null });
        return;
      }
      persist({ ...layout, sort: { field, direction } });
    },
    [layout, persist],
  );

  const resetLayout = useCallback(() => {
    persist(mergeColumnLayout(fieldIds, defaultWidths, null));
  }, [fieldIds, defaultWidths, persist]);

  const setColumnWidths = useCallback(
    (widths: Record<string, number>) => {
      persist({ ...layout, widths: { ...layout.widths, ...widths } });
    },
    [layout, persist],
  );

  return {
    layout,
    moveColumn,
    setWidth,
    toggleHidden,
    cycleSort,
    setSort,
    resetLayout,
    setColumnWidths,
    visibleOrder,
  };
}
