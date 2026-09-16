import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DVRDetailsPage from "./page";

const fetchEntity = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/data-verification-requests/42",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/misc/back-button", () => ({
  default: () => <button type="button">Back</button>,
}));

vi.mock("@/components/misc/copy-input", () => ({
  default: () => <div>DVR Link</div>,
}));

vi.mock("@/components/misc/audit-display", () => ({
  default: () => <div>Audit</div>,
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-form-config", () => ({
  useFormConfig: () => ({ data: { groups: [] }, isLoading: false }),
}));

vi.mock("@/components/primitives", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/primitives")>();
  return {
    ...actual,
    useToast: () => ({ add: vi.fn() }),
  };
});

afterEach(() => {
  cleanup();
});

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("DVRDetailsPage preview", () => {
  beforeEach(() => {
    fetchEntity.mockReset();
    fetchEntity.mockResolvedValue({
      data: {
        data: {
          id: 42,
          name: "Staff verify",
          fields: [{ name: "phone_number", required: true }],
          expires_on: "2026-08-01",
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          created_by: null,
        },
      },
    });
  });

  it("shows preview form instead of Requested Fields list", async () => {
    render(wrap(<DVRDetailsPage />));

    await waitFor(() => {
      expect(screen.getByTestId("dvr-preview")).toBeTruthy();
    });
    expect(screen.queryByText(/requested fields/i)).toBeNull();
    expect(
      screen.getByText(/this is what recipients will fill in/i),
    ).toBeTruthy();
  });
});
