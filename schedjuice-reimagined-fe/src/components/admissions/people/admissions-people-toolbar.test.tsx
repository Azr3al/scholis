import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  axiosClient: { get: vi.fn(), post: vi.fn() },
}));

const filters = {
  state: {
    tab: "students" as const,
    q: "",
    page: 1,
    includeInactive: false,
    includeAlumni: false,
  },
  setTab: vi.fn(),
  setQ: vi.fn(),
  setPage: vi.fn(),
  setIncludeInactive: vi.fn(),
  setIncludeAlumni: vi.fn(),
};

vi.mock("@/hooks/admissions/use-admissions-people-filters", () => ({
  useAdmissionsPeopleFilters: () => filters,
}));

import { AdmissionsPeopleToolbar } from "./admissions-people-toolbar";

afterEach(() => {
  cleanup();
  filters.state.tab = "students";
});

describe("AdmissionsPeopleToolbar", () => {
  it("shows Include alumni on Students, not Include inactive", () => {
    render(<AdmissionsPeopleToolbar />);
    expect(screen.getByText("Include alumni")).toBeTruthy();
    expect(screen.queryByText("Include inactive")).toBeNull();
  });

  it("shows Include inactive on Staff", () => {
    filters.state.tab = "staff";
    render(<AdmissionsPeopleToolbar />);
    expect(screen.getByText("Include inactive")).toBeTruthy();
    expect(screen.queryByText("Include alumni")).toBeNull();
  });
});
