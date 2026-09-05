import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReceiverTransactionsPage from "./page";
import { TransactionScreenshotStrategy } from "@/types/organization";

const useTenantMock = vi.fn();
const useReceiverSideScreenshotsListMock = vi.fn();

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => useTenantMock(),
}));

vi.mock("@/sdk/hooks/receiver-side-screenshots", () => ({
  useReceiverSideScreenshotsList: (...args: unknown[]) =>
    useReceiverSideScreenshotsListMock(...args),
}));

vi.mock("@/components/finances/record/use-finance-record-page-header", () => ({
  useFinancePageHeader: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/finances/receiver-transactions",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const defaultListResult = {
  rows: [
    {
      id: 1,
      transaction_id: "TXN-USER-UPLOAD-001",
      is_matched: false,
      updated_at: "2026-01-15T10:00:00Z",
      user_payment: null,
    },
  ],
  total: 1,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

describe("ReceiverTransactionsPage", () => {
  beforeEach(() => {
    useTenantMock.mockReset();
    useReceiverSideScreenshotsListMock.mockReset();
    useReceiverSideScreenshotsListMock.mockReturnValue(defaultListResult);
  });

  it("renders rows for user_upload tenants", () => {
    useTenantMock.mockReturnValue({
      tenant: {
        transaction_screenshot_strategy: TransactionScreenshotStrategy.user_upload,
      },
      isLoading: false,
    });

    render(wrap(<ReceiverTransactionsPage />));

    expect(screen.getByText("TXN-USER-UPLOAD-001")).toBeTruthy();
    expect(screen.getByText("Unmatched")).toBeTruthy();
  });

  it("shows a loading skeleton while tenant is loading", () => {
    useTenantMock.mockReturnValue({
      tenant: null,
      isLoading: true,
    });

    render(wrap(<ReceiverTransactionsPage />));

    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText("TXN-USER-UPLOAD-001")).toBeNull();
  });
});
