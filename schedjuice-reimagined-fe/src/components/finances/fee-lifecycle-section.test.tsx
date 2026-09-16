import { makePostRequest } from "@/app/client-api/utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeeLifecycleSection } from "./fee-lifecycle-section";

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
}));

const usePermissionsMock = vi.fn();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock("@/hooks/useTenantCurrencySymbol", () => ({
  useTenantCurrencySymbol: () => "Ks",
}));

function renderSection(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const filterState = {
  programId: "3",
  intakeId: "",
  period: "single_month" as const,
  dateFrom: new Date("2026-03-01"),
  dateTo: null,
};

describe("FeeLifecycleSection", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(makePostRequest).mockReset();
  });

  it("renders nothing and does not fetch when permission is missing", () => {
    usePermissionsMock.mockReturnValue({
      canAny: () => false,
    });
    renderSection(<FeeLifecycleSection filterState={filterState} />);
    expect(screen.queryByText(/fee lifecycle/i)).toBeNull();
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("shows the empty state for an all-zero payload", async () => {
    usePermissionsMock.mockReturnValue({
      canAny: (codes: string[]) => codes.includes("payment.view_all"),
    });
    vi.mocked(makePostRequest).mockResolvedValue({
      data: {
        data: {
          nodes: [],
          links: [],
          unattributed: { amount: "0.00", payment_count: 0 },
          meta: {
            period_label: "Mar 2026",
            date_from: "2026-03-01",
            date_to: "2026-03-31",
            cash_received: "0.00",
            refund_clamped: false,
          },
        },
      },
    });
    renderSection(<FeeLifecycleSection filterState={filterState} />);
    expect(
      await screen.findByText(/no billed fees for this period/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/same payment dates as cash received/i),
    ).toBeTruthy();
    expect(screen.queryByText(/follow billing coverage/i)).toBeNull();
  });

  it("keeps method breakdown nodes sourced from retained", async () => {
    usePermissionsMock.mockReturnValue({
      canAny: () => true,
    });
    vi.mocked(makePostRequest).mockImplementation(async (_url, body) => {
      const breakdown = (body as { breakdown: string }).breakdown;
      const methodNodes =
        breakdown === "payment_method"
          ? [
              {
                key: "method:1",
                label: "KBZ",
                amount: "80.00",
                is_estimated: false,
              },
            ]
          : [];
      const methodLinks =
        breakdown === "payment_method"
          ? [
              {
                source: "retained",
                target: "method:1",
                amount: "80.00",
                payment_count: 1,
                student_count: 1,
                is_estimated: false,
              },
            ]
          : [];
      return {
        data: {
          data: {
            nodes: [
              {
                key: "collected",
                label: "Collected",
                amount: "100.00",
                is_estimated: false,
              },
              {
                key: "retained",
                label: "Retained",
                amount: "80.00",
                is_estimated: false,
              },
              ...methodNodes,
            ],
            links: [
              {
                source: "collected",
                target: "retained",
                amount: "80.00",
                payment_count: 1,
                student_count: 1,
                is_estimated: false,
              },
              ...methodLinks,
            ],
            unattributed: { amount: "0.00", payment_count: 0 },
            meta: {
              period_label: "Mar 2026",
              date_from: "2026-03-01",
              date_to: "2026-03-31",
              cash_received: "100.00",
              refund_clamped: false,
            },
          },
        },
      };
    });
    renderSection(<FeeLifecycleSection filterState={filterState} />);
    await screen.findByText(/fee lifecycle/i);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByText("Payment method"));
    expect(makePostRequest).toHaveBeenCalledWith(
      "finance/fee-lifecycle",
      expect.objectContaining({ breakdown: "payment_method" }),
    );
  });
});
