import { describe, expect, it } from "vitest";

import {
  groupActivePaymentMethodsByBank,
  samplePaymentAssignmentDueDate,
  samplePaymentAssignmentDueLabel,
  samplePaymentAssignmentTitle,
  shouldShowPaymentAssignmentPreview,
} from "./payment-method-assignment-preview";

const methods = [
  {
    id: 2,
    name: "Kpay B",
    payment_bank: "KPAY",
    bank_account_number: "2",
    is_retired: false,
  },
  {
    id: 1,
    name: "Kpay A",
    payment_bank: "KPAY",
    bank_account_number: "1",
    is_retired: false,
  },
  {
    id: 3,
    name: "Yoma acct",
    payment_bank: "YOMA",
    bank_account_number: "3",
    is_retired: false,
  },
  {
    id: 4,
    name: "Old AYA",
    payment_bank: "AYA",
    bank_account_number: "4",
    is_retired: true,
  },
];

describe("groupActivePaymentMethodsByBank", () => {
  it("excludes retired methods and groups by PaymentBank enum order", () => {
    const groups = groupActivePaymentMethodsByBank(methods);
    expect(groups.map((group) => group.bank)).toEqual(["KPAY", "YOMA"]);
    expect(groups[0]?.methods.map((method) => method.name)).toEqual([
      "Kpay A",
      "Kpay B",
    ]);
    expect(groups.flatMap((group) => group.methods.map((m) => m.name))).not.toContain(
      "Old AYA",
    );
  });
});

describe("shouldShowPaymentAssignmentPreview", () => {
  it("is hidden unless Microsoft and Teams creation are both on", () => {
    expect(shouldShowPaymentAssignmentPreview(null)).toBe(false);
    expect(
      shouldShowPaymentAssignmentPreview({
        is_microsoft_on: true,
        is_teams_creation_enabled: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPaymentAssignmentPreview({
        is_microsoft_on: true,
        is_teams_creation_enabled: true,
      }),
    ).toBe(true);
  });
});

describe("sample payment assignment labels", () => {
  it("uses the current calendar month and the 3rd as the FM due date", () => {
    const now = new Date(2026, 8, 7);
    expect(samplePaymentAssignmentTitle(now)).toBe("September 2026 payment");
    expect(samplePaymentAssignmentDueDate(now)).toEqual(new Date(2026, 8, 3));
    expect(samplePaymentAssignmentDueLabel(new Date(2026, 8, 3))).toBe("3 Sep");
  });
});
