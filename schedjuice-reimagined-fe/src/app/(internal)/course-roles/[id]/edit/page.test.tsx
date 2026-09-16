import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssignedAsRoleEditPage from "./page";

const fetchEntity = vi.fn();
const updateEntity = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
  updateEntity: (...args: unknown[]) => updateEntity(...args),
  makePostRequest: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "7" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/course-roles/7/edit",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({
    tenant: { is_substitute_teachers_enabled: true },
  }),
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

describe("AssignedAsRoleEditPage", () => {
  beforeEach(() => {
    fetchEntity.mockReset();
    updateEntity.mockReset();
    fetchEntity.mockResolvedValue({
      data: {
        data: {
          name: "Cover role",
          is_collision_enabled: true,
          is_substitute: false,
          seniority: "OTHER",
        },
      },
    });
    updateEntity.mockResolvedValue({ data: { data: {} } });
  });

  it("does not save when substitute is toggled alone", async () => {
    const user = userEvent.setup();
    render(wrap(<AssignedAsRoleEditPage />));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Cover role")).toBeTruthy();
    });

    await user.click(screen.getByRole("checkbox", { name: /substitute role/i }));

    await waitFor(() => {
      expect(updateEntity).not.toHaveBeenCalled();
    });
  });

  it("uses a single Save button and sends substitute + seniority together", async () => {
    const user = userEvent.setup();
    render(wrap(<AssignedAsRoleEditPage />));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Cover role")).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save system role/i })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: /substitute role/i }));
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /main teacher/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateEntity).toHaveBeenCalledTimes(1);
    });

    expect(updateEntity).toHaveBeenCalledWith(
      "assigned-as-roles",
      "7",
      expect.objectContaining({
        name: "Cover role",
        is_collision_enabled: true,
        is_substitute: true,
        seniority: "MAIN_TEACHER",
      }),
    );
  });

  it("blocks save when substitute is enabled without MT/AT seniority", async () => {
    const user = userEvent.setup();
    render(wrap(<AssignedAsRoleEditPage />));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Cover role")).toBeTruthy();
    });

    await user.click(screen.getByRole("checkbox", { name: /substitute role/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/substitute roles require main teacher or assistant teacher/i),
      ).toBeTruthy();
    });
    expect(updateEntity).not.toHaveBeenCalled();
  });
});
