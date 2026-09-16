import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchEntities = vi.fn();

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/app/client-api/utils", () => ({
  searchEntities: (...args: unknown[]) => searchEntities(...args),
}));

vi.mock("@/components/shell/use-page-header", () => ({
  usePageHeader: vi.fn(),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { program_count: 1, timezone: "UTC" } }),
}));

vi.mock("nuqs", async () => {
  const React = await import("react");
  return {
    parseAsString: { withDefault: (d: string) => d },
    parseAsInteger: { withDefault: (d: number) => d },
    parseAsBoolean: {},
    parseAsArrayOf: () => ({ withDefault: (d: unknown) => d }),
    useQueryStates: () => {
      const [state, setState] = React.useState({
        program: "all",
        status: ["active"],
        intake: null,
        subjects: [],
        categories: [],
        q: "",
        my: false,
        page: 1,
      });
      return [state, setState];
    },
  };
});

import { AdmissionsCoursesPage } from "./admissions-courses-page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdmissionsCoursesPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  searchEntities.mockReset();
});

beforeEach(() => {
  searchEntities.mockResolvedValue({
    data: {
      data: [
        {
          id: 5,
          title: "A1 Flyers",
          start_date: "2026-06-01",
          end_date: "2026-08-31",
          current_unit: 8,
          current_unit_updated_at: "2026-08-03",
        },
      ],
      count: 1,
      total_pages: 1,
    },
  });
});

describe("AdmissionsCoursesPage", () => {
  it("does not link a course row to /courses/:id", async () => {
    renderPage();
    expect(await screen.findByText("A1 Flyers")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /a1 flyers/i })).toBeNull();
  });
});
