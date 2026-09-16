import { describe, expect, it } from "vitest";

import { shouldAutoDefaultPaymentInfo } from "@/hooks/use-auto-default-payment-info";

describe("shouldAutoDefaultPaymentInfo", () => {
  it("returns true when the staff member has no payout accounts", () => {
    expect(shouldAutoDefaultPaymentInfo(0)).toBe(true);
  });

  it("returns false when the staff member already has payout accounts", () => {
    expect(shouldAutoDefaultPaymentInfo(1)).toBe(false);
    expect(shouldAutoDefaultPaymentInfo(3)).toBe(false);
  });
});
