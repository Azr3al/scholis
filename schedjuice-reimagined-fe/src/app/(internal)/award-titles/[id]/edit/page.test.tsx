import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "3" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/shell/use-page-header", () => ({
  usePageHeader: () => {},
}));

vi.mock("@/components/primitives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/primitives")>();
  return {
    ...actual,
    useToast: () => ({ add: vi.fn() }),
  };
});

function renderPage(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock("@/lib/awards-api", () => ({
  getAwardTitle: vi.fn().mockResolvedValue({
    id: 3,
    name: "Top 1",
    family: null,
    course: null,
    is_pinned: true,
    origin: "admin",
    retired_at: null,
    sort_order: 0,
    created_by: null,
    created_at: "",
  }),
  updateAwardTitle: vi.fn(),
  retireAwardTitle: vi.fn(),
  getAwardCertificate: vi.fn(),
  createAwardCertificate: vi.fn(),
}));

describe("AwardTitleEditPage template action", () => {
  it("shows Create template when none exists", async () => {
    const { getAwardCertificate } = await import("@/lib/awards-api");
    vi.mocked(getAwardCertificate).mockResolvedValue(null);
    const Page = (await import("./page")).default;
    renderPage(<Page />);
    expect(await screen.findByRole("button", { name: /create template/i })).toBeTruthy();
  });

  it("shows Edit template on the right when one exists", async () => {
    const { getAwardCertificate } = await import("@/lib/awards-api");
    vi.mocked(getAwardCertificate).mockResolvedValue({
      id: 9,
      title: 3,
      name: "Top 1",
      document: {},
      background_url: null,
      created_by: null,
      created_at: "",
    });
    const Page = (await import("./page")).default;
    renderPage(<Page />);
    const link = await screen.findByRole("link", { name: /edit template/i });
    expect(link.getAttribute("href")).toBe("/award-titles/3/certificate");
  });
});
