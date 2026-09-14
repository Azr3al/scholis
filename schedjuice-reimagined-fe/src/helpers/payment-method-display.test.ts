import { describe, expect, it } from "vitest";

import { formatPaymentMethodDisplayName } from "./payment-method-display";

describe("formatPaymentMethodDisplayName", () => {
  it("returns the name for an active method", () => {
    expect(
      formatPaymentMethodDisplayName({ name: "Daw Khin Hlaing (KPAY)" }),
    ).toBe("Daw Khin Hlaing (KPAY)");
  });

  it("appends (retired) when the method is retired", () => {
    expect(
      formatPaymentMethodDisplayName({
        name: "Old AYA",
        is_retired: true,
      }),
    ).toBe("Old AYA (retired)");
  });

  it("falls back to Account #id when name is empty", () => {
    expect(formatPaymentMethodDisplayName({ id: 12, name: "" })).toBe(
      "Account #12",
    );
  });
});
