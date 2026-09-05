/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";

import {
  computeCartTotal,
  makePaymentCartStorageKey,
  readCartIdsFromStorage,
  resolveDeepLinkPaymentId,
  writeCartIdsToStorage,
} from "./use-make-payment-cart";

describe("makePaymentCartStorageKey", () => {
  it("scopes storage by user id", () => {
    expect(makePaymentCartStorageKey("42")).toBe("sj:make-payment-cart:42");
  });
});

describe("cart storage", () => {
  it("round-trips cart ids in sessionStorage", () => {
    writeCartIdsToStorage("7", [10, 20]);
    expect(readCartIdsFromStorage("7")).toEqual([10, 20]);
  });
});

describe("computeCartTotal", () => {
  it("sums invoiced amounts for cart members only", () => {
    const total = computeCartTotal(
      [
        { id: 1, invoiced_amount: "60000" },
        { id: 2, invoiced_amount: "40000" },
        { id: 3, invoiced_amount: "10000" },
      ],
      new Set([1, 2]),
    );
    expect(total).toBe(100000);
  });
});

describe("resolveDeepLinkPaymentId", () => {
  it("returns pending payment id for matching course", () => {
    const id = resolveDeepLinkPaymentId(
      [
        { id: 55, course: { id: 42 } },
        { id: 56, course: { id: 99 } },
      ],
      "42",
    );
    expect(id).toBe(55);
  });

  it("returns null for invalid course id", () => {
    expect(resolveDeepLinkPaymentId([], "abc")).toBeNull();
  });
});
