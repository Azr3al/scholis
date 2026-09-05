import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchEntities = vi.fn();
const makeGetRequest = vi.fn();

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/app/client-api/utils", () => ({
  searchEntities: (...args: unknown[]) => searchEntities(...args),
  makeGetRequest: (...args: unknown[]) => makeGetRequest(...args),
}));

vi.mock("@/components/shell/use-page-header", () => ({
  usePageHeader: vi.fn(),
}));

vi.mock("nuqs", async () => {
  const React = await import("react");
  return {
    parseAsStringEnum: () => ({ withDefault: (d: string) => d }),
    parseAsString: { withDefault: (d: string) => d },
    parseAsInteger: { withDefault: (d: number) => d },
    parseAsBoolean: { withDefault: (d: boolean) => d },
    useQueryStates: () => {
      const [state, setState] = React.useState({
        tab: "students",
        q: "",
        page: 1,
        includeInactive: false,
        incomplete: false,
      });
      return [state, setState];
    },
    useQueryState: () => React.useState<number | null>(null),
  };
});

import { AdmissionsPeoplePage } from "./admissions-people-page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdmissionsPeoplePage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  searchEntities.mockReset();
  makeGetRequest.mockReset();
});

beforeEach(() => {
  searchEntities.mockResolvedValue({
    data: {
      data: [
        {
          id: 11,
          name: "Aung",
          email: "a@x",
          phone_number: "09",
          is_active: true,
        },
      ],
      count: 1,
      total_pages: 1,
    },
  });
});

describe("AdmissionsPeoplePage", () => {
  it("does not render Create", async () => {
    renderPage();
    await screen.findByRole("button", { name: /aung/i });
    expect(screen.queryByRole("link", { name: /create/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /create/i })).toBeNull();
  });

  it("searches admissions/people with the Students role filter by default", async () => {
    renderPage();
    await screen.findByRole("button", { name: /aung/i });
    const listCall = searchEntities.mock.calls.find(
      (call) => (call[1] as { size?: number } | undefined)?.size === 24,
    );
    expect(listCall?.[0]).toBe("admissions/people");
    const body = listCall?.[2] as { filter_params?: Array<{ operator?: string }> };
    expect(body.filter_params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_name: "roles",
          operator: "contained_by",
        }),
      ]),
    );
  });

  it("loads attending from admissions/people/:id/attending, not users/:id", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: 11,
          name: "Aung",
          email: "a@x",
          phone_number: "09",
          is_active: true,
          classes: [],
        },
      },
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /aung/i }));
    await waitFor(() => {
      expect(makeGetRequest).toHaveBeenCalledWith(
        "admissions/people/11/attending",
      );
    });
    expect(makeGetRequest).not.toHaveBeenCalledWith(
      expect.stringMatching(/^users\/11/),
    );
  });

  it("shows legal name and muted alt name", async () => {
    searchEntities.mockResolvedValue({
      data: {
        data: [
          {
            id: 11,
            name: "Maung Maung",
            alternative_name: "aung aung",
            email: "a@x",
            phone_number: "09",
            is_active: true,
          },
        ],
        count: 1,
        total_pages: 1,
      },
    });
    renderPage();
    const btn = await screen.findByRole("button", { name: /maung maung/i });
    expect(btn.textContent).toContain("Maung Maung");
    expect(btn.textContent).toContain("aung aung");
    expect(screen.getByText("aung aung").className).toMatch(/text-text-muted/);
  });

  it("omits alt name when blank or equal to name", async () => {
    searchEntities.mockResolvedValue({
      data: {
        data: [
          {
            id: 11,
            name: "Aung",
            alternative_name: "Aung",
            email: "a@x",
            phone_number: "09",
            is_active: true,
          },
        ],
        count: 1,
        total_pages: 1,
      },
    });
    renderPage();
    const btn = await screen.findByRole("button", { name: /^aung$/i });
    expect(btn.querySelectorAll("span").length).toBe(1);
  });
});
