import { describe, expect, it } from "vitest";
import { buildRecentTxnFilterParams } from "./build-recent-txn-filter-params";
import { operatorEnum } from "@/types/api";
import { PaymentBank } from "@/types/finance";
import type { accountType } from "@/types/user";

const user = { id: 1 } as accountType;
const monthDate = new Date(2026, 7, 1);

describe("buildRecentTxnFilterParams", () => {
  it("omits bank filter when paymentBanks is empty", () => {
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      monthDate,
      paymentBanks: [],
    });
    expect(
      result.filter_params?.some(
        (p) => p.field_name === "payment_method__payment_bank",
      ),
    ).toBe(false);
  });

  it("emits in filter for one or more banks", () => {
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      monthDate,
      paymentBanks: [PaymentBank.CB, PaymentBank.KPAY],
    });
    expect(result.filter_params).toContainEqual({
      field_name: "payment_method__payment_bank",
      operator: operatorEnum.in,
      value: "CB,KPAY",
    });
  });

  it("omits bank filter when all PaymentBank values are selected", () => {
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      monthDate,
      paymentBanks: Object.values(PaymentBank),
    });
    expect(
      result.filter_params?.some(
        (p) => p.field_name === "payment_method__payment_bank",
      ),
    ).toBe(false);
  });

  it("omits date bounds when monthDate and day are unset", () => {
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
    });
    expect(
      result.filter_params?.some((p) => p.field_name === "payment_date"),
    ).toBe(false);
  });

  it("emits month gte/lte on payment_date when only monthDate is set", () => {
    // Recent transactions month filter = screenshot upload date (payment_date), not billing period.
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      monthDate,
    });
    const bounds = result.filter_params?.filter(
      (p) => p.field_name === "payment_date",
    );
    expect(bounds).toHaveLength(2);
    expect(bounds?.[0]?.operator).toBe(operatorEnum.gte);
    expect(bounds?.[1]?.operator).toBe(operatorEnum.lte);
  });

  it("emits single-day bounds when day is set", () => {
    const day = new Date(2026, 7, 10);
    const result = buildRecentTxnFilterParams(user, {
      transactionId: "",
      courseId: "",
      monthDate,
      day,
    });
    const bounds = result.filter_params?.filter(
      (p) => p.field_name === "payment_date",
    );
    expect(bounds).toHaveLength(2);
    const gte = new Date(String(bounds?.[0]?.value));
    expect(gte.getFullYear()).toBe(2026);
    expect(gte.getMonth()).toBe(7);
    expect(gte.getDate()).toBe(10);
  });
});
