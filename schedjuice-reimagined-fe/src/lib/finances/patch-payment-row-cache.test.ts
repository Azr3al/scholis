import { describe, expect, it } from "vitest";

import { applyPaymentRowPatchToCacheData } from "./patch-payment-row-cache";

describe("applyPaymentRowPatchToCacheData", () => {
  it("returns null when data has no rows array", () => {
    expect(
      applyPaymentRowPatchToCacheData({ total: 0 }, 1, { description: "x" }),
    ).toBeNull();
    expect(
      applyPaymentRowPatchToCacheData(null, 1, { description: "x" }),
    ).toBeNull();
  });

  it("returns null when no row matches id", () => {
    const data = { rows: [{ id: 2, description: "a" }], summary: { n: 1 } };
    expect(
      applyPaymentRowPatchToCacheData(data, 1, { description: "b" }),
    ).toBeNull();
  });

  it("patches the matching row and preserves sibling fields / summary", () => {
    const data = {
      rows: [
        { id: 1, description: "old", status: "pending_payment" },
        { id: 2, description: "other" },
      ],
      summary: { total: 2 },
    };
    const next = applyPaymentRowPatchToCacheData(data, 1, {
      description: "new",
    });
    expect(next).toEqual({
      rows: [
        { id: 1, description: "new", status: "pending_payment" },
        { id: 2, description: "other" },
      ],
      summary: { total: 2 },
    });
    // Original untouched
    expect(data.rows[0]!.description).toBe("old");
  });

  it("matches string/number ids loosely", () => {
    const data = { rows: [{ id: 10, transaction_id: "a" }], total: 1 };
    const next = applyPaymentRowPatchToCacheData(data, "10", {
      transaction_id: "b",
    });
    expect(next?.rows[0]).toMatchObject({ id: 10, transaction_id: "b" });
  });
});
