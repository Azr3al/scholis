import { describe, expect, it } from "vitest";

import {
  getPaymentMethodsForDisplay,
  MOBILE_PAYMENT_METHODS_INITIAL_VISIBLE_COUNT,
  resolveAccountNumber,
} from "./payment-method-instructions";

const methods = [
  { id: 1, name: "KBZ", payment_bank: "KBZ Pay" },
  { id: 2, name: "AYA", payment_bank: "AYA Pay" },
  { id: 3, name: "CB", payment_bank: "CB Bank" },
  { id: 4, name: "UAB", payment_bank: "UAB Pay" },
];

describe("getPaymentMethodsForDisplay", () => {
  it("shows all methods on wide viewports", () => {
    expect(
      getPaymentMethodsForDisplay(methods, {
        isNarrowViewport: false,
        showAll: false,
      }),
    ).toEqual({
      visibleMethods: methods,
      canExpand: false,
      hiddenCount: 0,
    });
  });

  it("collapses to the initial count on narrow viewports", () => {
    expect(
      getPaymentMethodsForDisplay(methods, {
        isNarrowViewport: true,
        showAll: false,
      }),
    ).toEqual({
      visibleMethods: methods.slice(0, MOBILE_PAYMENT_METHODS_INITIAL_VISIBLE_COUNT),
      canExpand: true,
      hiddenCount: methods.length - MOBILE_PAYMENT_METHODS_INITIAL_VISIBLE_COUNT,
    });
  });

  it("shows all methods on narrow viewports after expand", () => {
    expect(
      getPaymentMethodsForDisplay(methods, {
        isNarrowViewport: true,
        showAll: true,
      }),
    ).toEqual({
      visibleMethods: methods,
      canExpand: true,
      hiddenCount: 0,
    });
  });

  it("does not offer expand when there are only two methods", () => {
    const twoMethods = methods.slice(0, 2);
    expect(
      getPaymentMethodsForDisplay(twoMethods, {
        isNarrowViewport: true,
        showAll: false,
      }),
    ).toEqual({
      visibleMethods: twoMethods,
      canExpand: false,
      hiddenCount: 0,
    });
  });
});

describe("resolveAccountNumber", () => {
  it("prefers bank_account_number over description", () => {
    expect(
      resolveAccountNumber({
        bank_account_number: "09123456789",
        description: "legacy note",
      }),
    ).toBe("09123456789");
  });

  it("falls back to description when bank_account_number is empty", () => {
    expect(
      resolveAccountNumber({
        bank_account_number: "",
        description: "09123456789",
      }),
    ).toBe("09123456789");
  });

  it("returns null when neither field has a value", () => {
    expect(
      resolveAccountNumber({
        bank_account_number: null,
        description: null,
      }),
    ).toBeNull();
  });
});
