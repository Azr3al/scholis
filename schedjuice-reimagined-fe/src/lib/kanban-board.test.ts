import { describe, expect, it } from "vitest";

import { applyOptimisticMove, groupByColumnId } from "./kanban-board";

describe("groupByColumnId", () => {
  it("groups items under column ids in item order", () => {
    const columns = [{ id: 1 }, { id: 2 }];
    const items = [
      { id: 10, statusId: 1 },
      { id: 11, statusId: 2 },
      { id: 12, statusId: 1 },
    ];
    const grouped = groupByColumnId(columns, items, (i) => i.statusId);
    expect(grouped.get(1)?.map((i) => i.id)).toEqual([10, 12]);
    expect(grouped.get(2)?.map((i) => i.id)).toEqual([11]);
  });

  it("includes columns with no items as empty arrays", () => {
    const columns = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const items = [{ id: 10, statusId: 1 }];
    const grouped = groupByColumnId(columns, items, (i) => i.statusId);
    expect(grouped.get(2)).toEqual([]);
    expect(grouped.get(3)).toEqual([]);
  });

  it("still buckets items whose column id is not in the columns list", () => {
    const columns = [{ id: 1 }];
    const items = [{ id: 10, statusId: 1 }, { id: 11, statusId: 99 }];
    const grouped = groupByColumnId(columns, items, (i) => i.statusId);
    expect(grouped.get(99)?.map((i) => i.id)).toEqual([11]);
  });

  it("returns an empty map when there are no columns or items", () => {
    const grouped = groupByColumnId([], [], () => 0);
    expect(grouped.size).toBe(0);
  });
});

describe("applyOptimisticMove", () => {
  it("applies the patch only to the matching item", () => {
    const items = [
      { id: 1, status: 1 },
      { id: 2, status: 1 },
    ];
    const next = applyOptimisticMove(items, 1, (item) => ({ ...item, status: 9 }));
    expect(next.find((i) => i.id === 1)?.status).toBe(9);
    expect(next.find((i) => i.id === 2)?.status).toBe(1);
  });

  it("returns a new array without mutating the original", () => {
    const items = [{ id: 1, status: 1 }];
    const next = applyOptimisticMove(items, 1, (item) => ({ ...item, status: 9 }));
    expect(next).not.toBe(items);
    expect(items[0].status).toBe(1);
  });

  it("is a no-op when the item id is not found", () => {
    const items = [{ id: 1, status: 1 }];
    const next = applyOptimisticMove(items, 404, (item) => ({ ...item, status: 9 }));
    expect(next).toEqual(items);
  });
});
