import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PaymentGridSummaryStrip } from "./payment-grid-summary-strip";
import type { accountType } from "@/types/user";

const useUserMock = vi.fn();

vi.mock("@/hooks/useUser", () => ({
  useUser: () => useUserMock(),
}));

vi.mock(
  "@/components/finances/payments-grid/teams-payment-assignment-status-line",
  () => ({
    TeamsPaymentAssignmentStatusLine: () => null,
  }),
);

function renderStrip(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("PaymentGridSummaryStrip monthApplicable", () => {
  beforeEach(() => {
    cleanup();
    useUserMock.mockReturnValue({
      user: {
        id: 1,
        permissions: ["payment.show_fee"],
        roles: ["finance"],
      } as accountType,
    });
  });

  it("hides stat pills when month is not applicable", () => {
    renderStrip(
      <PaymentGridSummaryStrip
        rows={[]}
        currencySymbol="Ks"
        fixedCourseId="1"
        courseMeta={{
          id: 1,
          title: "ACCA AA",
          start_date: "2026-10-03",
          end_date: "2027-02-28",
        }}
        monthAnchor={new Date(2026, 6, 1)}
        monthApplicable={false}
      />,
    );
    expect(screen.queryByText("Total")).toBeNull();
    expect(screen.getByText("ACCA AA")).toBeTruthy();
  });

  it("shows payment plan name, fee, and billing type when provided", () => {
    renderStrip(
      <PaymentGridSummaryStrip
        rows={[]}
        currencySymbol="Ks"
        fixedCourseId="1"
        courseMeta={{
          id: 1,
          title: "Discount Test",
          start_date: "2026-07-01",
          end_date: "2027-01-01",
        }}
        coursePaymentPlan={{
          id: 10,
          name: "Standard plan",
          billing_type: "whole_term",
          price: "700000",
        }}
        monthAnchor={new Date(2026, 6, 1)}
      />,
    );
    expect(screen.getByText(/Standard plan/)).toBeTruthy();
    expect(screen.getByText(/Ks 700,000/)).toBeTruthy();
    expect(screen.getByText(/Whole term/)).toBeTruthy();
  });

  it("hides fee when user lacks payment.show_fee", () => {
    useUserMock.mockReturnValue({
      user: {
        id: 2,
        permissions: [],
        roles: ["teacher"],
      } as unknown as accountType,
    });
    renderStrip(
      <PaymentGridSummaryStrip
        rows={[]}
        currencySymbol="Ks"
        fixedCourseId="1"
        courseMeta={{
          id: 1,
          title: "Discount Test",
        }}
        coursePaymentPlan={{
          id: 10,
          name: "Standard plan",
          billing_type: "whole_term",
        }}
        monthAnchor={new Date(2026, 6, 1)}
      />,
    );
    expect(screen.getByText(/Standard plan/)).toBeTruthy();
    expect(screen.getByText(/Whole term/)).toBeTruthy();
    expect(screen.queryByText(/^Fee /)).toBeNull();
  });
});
