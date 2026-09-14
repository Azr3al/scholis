import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeamsPaymentAssignmentPreview } from "./teams-payment-assignment-preview";
import type { PaymentMethod } from "@/sdk";

const methods: PaymentMethod[] = [
  {
    id: 1,
    name: "Kpay A",
    payment_bank: "KPAY",
    bank_account_number: "111",
    is_retired: false,
  },
  {
    id: 2,
    name: "Old AYA",
    payment_bank: "AYA",
    bank_account_number: "222",
    is_retired: true,
  },
  {
    id: 3,
    name: "Yoma acct",
    payment_bank: "YOMA",
    bank_account_number: "333",
    is_retired: false,
  },
];

afterEach(() => {
  cleanup();
});

describe("TeamsPaymentAssignmentPreview", () => {
  it("groups active methods by bank and omits retired ones", () => {
    render(
      <TeamsPaymentAssignmentPreview
        methods={methods}
        now={new Date(2026, 8, 7)}
      />,
    );

    expect(screen.getByText("September 2026 payment")).toBeInTheDocument();
    expect(screen.getByText("Due 3 Sep")).toBeInTheDocument();
    expect(screen.getByText("KPAY")).toBeInTheDocument();
    expect(screen.getByText("YOMA")).toBeInTheDocument();
    expect(screen.getByText("Kpay A")).toBeInTheDocument();
    expect(screen.queryByText("Old AYA")).not.toBeInTheDocument();
    expect(screen.queryByText("AYA")).not.toBeInTheDocument();
  });
});
