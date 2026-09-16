import { describe, expect, it } from "vitest";
import { unwrapList } from "../core/envelope";

describe("unwrapList", () => {

  it("falls back to total when count is absent", () => {
    const result = unwrapList<{ id: number }>({
      data: { data: [{ id: 2 }], total: 7 },
    });
    expect(result.rows).toEqual([{ id: 2 }]);
    expect(result.total).toBe(7);
  });

  it("derives total from total_pages * pageSize as last resort", () => {
    const result = unwrapList<{ id: number }>(
      {
        data: {
          data: [{ id: 3 }, { id: 4 }],
          total_pages: 3,
        },
      },
      { pageSize: 20 },
    );
    expect(result.rows).toEqual([{ id: 3 }, { id: 4 }]);
    expect(result.total).toBe(60);
  });
});
