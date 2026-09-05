import { describe, expect, it } from "vitest";
import {
  canCreateSyntheticPaymentStub,
  buildSyntheticPaymentStubFormData,
} from "./synthetic-payment-stub";

describe("canCreateSyntheticPaymentStub", () => {
  it("requires both amount and payment method", () => {
    expect(
      canCreateSyntheticPaymentStub({ parsedAmount: "", paymentMethodId: "1" }),
    ).toBe(false);
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "1000",
        paymentMethodId: "",
      }),
    ).toBe(false);
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "1000",
        paymentMethodId: "3",
      }),
    ).toBe(true);
  });

  it("rejects non-positive amounts", () => {
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "0",
        paymentMethodId: "3",
      }),
    ).toBe(false);
    expect(
      canCreateSyntheticPaymentStub({
        parsedAmount: "-5",
        paymentMethodId: "3",
      }),
    ).toBe(false);
  });
});

describe("buildSyntheticPaymentStubFormData", () => {
  it("builds scan-transaction-screenshots body without screenshot", () => {
    const issuedStart = new Date("2026-07-01T00:00:00.000Z");
    const issuedEnd = new Date("2026-07-31T23:59:59.999Z");
    const fd = buildSyntheticPaymentStubFormData({
      userId: 10,
      courseId: 20,
      createdById: 99,
      issuedAtIso: issuedStart.toISOString(),
      billingStartIso: issuedStart.toISOString(),
      billingEndIso: issuedEnd.toISOString(),
      parsedAmount: "15000",
      paymentMethodId: "3",
      transactionId: "TXN",
      description: "note",
      remarks: "vip note",
      dateOnScreenshot: "",
    });
    expect(fd.get("user")).toBe("10");
    expect(fd.get("course")).toBe("20");
    expect(fd.get("created_by")).toBe("99");
    expect(fd.get("parsed_amount")).toBe("15000");
    expect(fd.get("payment_method")).toBe("3");
    expect(fd.get("transaction_id")).toBe("TXN");
    expect(fd.get("description")).toBe("note");
    expect(fd.get("remarks")).toBe("vip note");
    expect(fd.get("screenshot")).toBeNull();
    expect(fd.get("date_on_screenshot")).toBeNull();
  });
});
