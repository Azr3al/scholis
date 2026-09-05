import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const canAny = vi.fn();
let pageHeader: { breadcrumb?: React.ReactNode } = {};

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canAny }),
}));

vi.mock("@/components/shell/use-page-header", () => ({
  usePageHeader: (config: { breadcrumb?: React.ReactNode }) => {
    pageHeader = config;
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false, isError: false }),
    useMutation: () => ({ mutate: vi.fn(), isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/primitives", async () => {
  const actual = await vi.importActual<typeof import("@/components/primitives")>(
    "@/components/primitives",
  );
  return { ...actual, useToast: () => ({ add: vi.fn() }) };
});

import StudioPage from "./page";

afterEach(() => {
  cleanup();
  canAny.mockReset();
  pageHeader = {};
});

describe("Studio library page", () => {
  it("uses Documents as the panel title, not Studio", () => {
    canAny.mockReturnValue(true);
    render(<StudioPage />);
    const crumb = pageHeader.breadcrumb;
    cleanup();
    render(<>{crumb}</>);
    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Studio" })).toBeNull();
  });
  it("hides Award titles without award_title.manage", () => {
    canAny.mockImplementation((codes: string[]) =>
      codes.includes("document_template.manage"),
    );
    render(<StudioPage />);
    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Award titles" }),
    ).toBeNull();
  });

  it("hides Documents without document_template.manage", () => {
    canAny.mockImplementation((codes: string[]) =>
      codes.includes("award_title.manage"),
    );
    render(<StudioPage />);
    expect(screen.getByRole("heading", { name: "Award titles" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Documents" })).toBeNull();
  });
});
