import type { FormConfig } from "@/types/form-config";

import { UNGROUPED_ID } from "./group-structure";

export type ReorderItem = {
  id: number;
  sort_order: number;
  group_id?: number | null;
};

export type GroupReorderItem = { id: number; sort_order: number };

/**
 * Given the target group and the new ordered field ids inside it, produce the
 * bulk-reorder payload. The synthetic ungrouped bucket maps to group_id=null.
 */
export function reindexGroupFields(
  groupId: number,
  orderedFieldIds: number[]
): ReorderItem[] {
  const gid = groupId === UNGROUPED_ID ? null : groupId;
  return orderedFieldIds.map((id, index) => ({
    id,
    sort_order: index,
    group_id: gid,
  }));
}

/** Given the new ordered group ids, produce the group bulk-reorder payload. */
export function reindexGroups(orderedGroupIds: number[]): GroupReorderItem[] {
  return orderedGroupIds
    .filter((id) => id !== UNGROUPED_ID)
    .map((id, index) => ({ id, sort_order: index }));
}

function sortByOrderThenId<T extends { sortOrder: number; id: number | null }>(
  a: T,
  b: T,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return (a.id ?? 0) - (b.id ?? 0);
}

/**
 * Optimistically reorder groups in a cached form-config. Groups not present in
 * `items` (e.g. the id:null "General" bucket) keep their relative order at the end.
 */
export function applyGroupReorder(
  config: FormConfig,
  items: GroupReorderItem[],
): FormConfig {
  const orderById = new Map(items.map((item) => [item.id, item.sort_order]));
  const reordered = config.groups.map((group) => {
    if (group.id == null || !orderById.has(group.id)) return group;
    return { ...group, sortOrder: orderById.get(group.id)! };
  });

  const touched = reordered.filter((group) => group.id != null && orderById.has(group.id));
  const untouched = reordered.filter((group) => group.id == null || !orderById.has(group.id));
  touched.sort(sortByOrderThenId);

  return {
    ...config,
    groups: [...touched, ...untouched],
  };
}

/**
 * Optimistically reorder fields within each group in a cached form-config.
 * Only fields whose ids appear in `items` are re-sorted; other fields are unchanged.
 */
export function applyFieldReorder(
  config: FormConfig,
  items: ReorderItem[],
): FormConfig {
  const orderById = new Map(items.map((item) => [item.id, item.sort_order]));

  return {
    ...config,
    groups: config.groups.map((group) => {
      const fields = group.fields.map((field) =>
        orderById.has(field.id)
          ? { ...field, sortOrder: orderById.get(field.id)! }
          : field,
      );
      fields.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
      });
      return { ...group, fields };
    }),
  };
}
